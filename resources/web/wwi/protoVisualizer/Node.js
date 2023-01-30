'use strict';

import {getAnId} from '../nodes/utils/id_provider.js';
import TemplateEngine from './TemplateEngine.js';
import Tokenizer from './Tokenizer.js';
import {vrmlFactory} from './Vrml.js';
import {FieldModel} from './FieldModel.js';
import {Parameter} from './Parameter.js';
import WbWorld from '../nodes/WbWorld.js';

export default class Node {
  static cProtoModels = new Map();
  static cBaseModels = new Map();
  static cNodeSiblings = new Map(); // maps a node id to all other instances of the same node (clones, but different id)

  constructor(url, protoText, isRoot = false) {
    // IMPORTANT! When adding new member variables of type Map, modify the .clone method so that it creates a copy of it
    this.id = getAnId();
    this.baseType = undefined; // may correspond to a base-node or another PROTO if it's a derived PROTO
    this.isRoot = isRoot;

    this.url = url;
    this.isProto = this.url.toLowerCase().endsWith('.proto');

    this.name = this.isProto ? this.url.slice(this.url.lastIndexOf('/') + 1).replace('.proto', '') : url;

    this.parameters = new Map();
    this.externProto = new Map();
    this.def = new Map();

    if (!this.isProto) {
      // create parameters from the pre-defined FieldModel
      const fields = FieldModel[this.name];
      for (const parameterName of Object.keys(fields)) {
        const type = FieldModel[this.name][parameterName]['type'];
        const defaultValue = vrmlFactory(type);
        defaultValue.setValueFromJavaScript(FieldModel[this.name][parameterName]['defaultValue']);
        const value = defaultValue.clone(true);
        const parameter = new Parameter(this, parameterName, type, [], defaultValue, value, false);
        this.parameters.set(parameterName, parameter);
      }

      return;
    }

    // raw PROTO body text must be kept in case the template needs to be regenerated
    const indexBeginBody = protoText.search(/(?<=\]\s*\n*\r*)({)/g);
    this.rawBody = protoText.substring(indexBeginBody);
    if (!this.isTemplate)
      this.protoBody = this.rawBody; // body already in VRML format

    // interface (i.e. parameters) only needs to be parsed once and persists through regenerations
    const indexBeginInterface = protoText.search(/(^\s*PROTO\s+[a-zA-Z0-9\-_+]+\s*\[\s*$)/gm);
    this.rawInterface = protoText.substring(indexBeginInterface, indexBeginBody);

    // header defines tags and EXTERNPROTO, persists through regenerations
    this.rawHeader = protoText.substring(0, indexBeginInterface);

    // for PROTO only
    const match = this.rawHeader.match(/R(\d+)([a-z])(?:\srevision\s(\d+)|-rev(\d+))?(?:-(\w*))?(?:-(\w*\/\w*\/\w*))?/);
    const version = {'major': parseInt(match[1]), 'revision': typeof match[4] === 'undefined' ? 0 : parseInt(match[4])};
    this.isTemplate = protoText.search('template language: javascript') !== -1;
    if (this.isTemplate)
      this.templateEngine = new TemplateEngine(Math.abs(parseInt(this.id.replace('n', ''))), version);

    // get EXTERNPROTO
    this.promises = [];
    const lines = this.rawHeader.split('\n');
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];
      if (line.indexOf('EXTERNPROTO') !== -1) {
        // get only the text after 'EXTERNPROTO' for the single line
        line = line.split('EXTERNPROTO')[1].trim();
        let address = line.replaceAll('"', '');
        let protoName = address.split('/').pop().replace('.proto', '');
        if (address.startsWith('webots://'))
          address = 'https://raw.githubusercontent.com/cyberbotics/webots/R2022b/' + address.substring(9);
        else
          address = combinePaths(address, this.url);

        this.externProto.set(protoName, address);
        this.promises.push(this.getExternProto(address));
      }
    }
  };

  async getExternProto(protoUrl) {
    return new Promise((resolve, reject) => {
      const xmlhttp = new XMLHttpRequest();
      xmlhttp.open('GET', protoUrl, true);
      xmlhttp.overrideMimeType('plain/text');
      xmlhttp.onreadystatechange = async() => {
        if (xmlhttp.readyState === 4 && (xmlhttp.status === 200 || xmlhttp.status === 0)) // Some browsers return HTTP Status 0 when using non-http protocol (for file://)
          resolve(xmlhttp.responseText);
      };
      xmlhttp.send();
    }).then(async text => {
      const prototype = await this.createPrototype(text, protoUrl);
      return prototype;
    });
  }

  async createPrototype(protoText, protoUrl) {
    if (!Node.cProtoModels.has(protoUrl)) {
      const proto = new Node(protoUrl, protoText);
      await proto.generateInterface();
      Node.cProtoModels.set(protoUrl, proto);
    }
  }

  async generateInterface() {
    return Promise.all(this.promises).then(async() => {
      // parse header and map each parameter entry
      await this.parseHead();
    });
  }

  clone(deep = false) {
    let copy = Object.assign(Object.create(Object.getPrototypeOf(this)), this);

    if (typeof this.baseType !== 'undefined')
      copy.baseType = this.baseType.clone(deep);

    copy.id = getAnId();

    if (!deep) {
      if (!Node.cNodeSiblings.has(this.id))
        Node.cNodeSiblings.set(this.id, []);
      if (!Node.cNodeSiblings.has(copy.id))
        Node.cNodeSiblings.set(copy.id, []);

      const s1 = Node.cNodeSiblings.get(this.id);
      s1.push(copy); // add copy as a sibling of this node
      const s2 = Node.cNodeSiblings.get(copy.id);
      s2.push(this); // add this node as a sibling of the copy
    }

    copy.parameters = new Map();
    for (const [parameterName, parameter] of this.parameters) {
      if (typeof parameter !== 'undefined') {
        const parameterCopy = parameter.clone(deep);
        parameterCopy.node = copy;
        copy.parameters.set(parameterName, parameterCopy);
      }
    }

    copy.def = new Map(this.def);
    copy.externProto = new Map(this.externProto);
    return copy;
  }

  async parseHead() {
    // change all relative paths to remote ones
    const re = /"(?:[^"]*)\.(jpe?g|png|hdr|obj|stl|dae)"/g;
    let result;
    while ((result = re.exec(this.rawInterface)) !== null)
      this.rawInterface = this.rawInterface.replace(result[0], '"' + combinePaths(result[0].slice(1, -1), this.url) + '"');

    const headTokenizer = new Tokenizer(this.rawInterface, this);
    headTokenizer.tokenize();

    // build parameter list
    headTokenizer.skipToken('PROTO');
    this.protoName = headTokenizer.nextWord();

    while (!headTokenizer.peekToken().isEof()) {
      const token = headTokenizer.nextToken();
      let nextToken = headTokenizer.peekToken();

      const restrictions = [];
      if (token.isKeyword() && nextToken.isPunctuation()) {
        if (nextToken.word() === '{') {
          // parse field restrictions
          headTokenizer.skipToken('{');
          const parameterType = token.fieldTypeFromVrml();
          while (headTokenizer.peekWord() !== '}') {
            const value = vrmlFactory(parameterType, headTokenizer);
            restrictions.push(value);
          }
          headTokenizer.skipToken('}');
          nextToken = headTokenizer.peekToken(); // we need to update the nextToken as it has to point after the restrictions
        }
      }

      if (token.isKeyword() && nextToken.isIdentifier()) {
        const parameterName = nextToken.word();
        const parameterType = token.fieldTypeFromVrml();
        const isRegenerator = this.isTemplate ? (this.rawBody.search('fields.' + parameterName + '.') !== -1) : false;
        headTokenizer.nextToken(); // consume the token containing the parameter name

        const defaultValue = vrmlFactory(parameterType, headTokenizer);
        const value = defaultValue.clone(true);
        const parameter = new Parameter(this, parameterName, parameterType, restrictions, defaultValue, value, isRegenerator);
        this.parameters.set(parameterName, parameter);
      }
    }
  };

  parseBody(isRegenerating = false) {
    this.clearReferences();
    // note: if not a template, the body is already pure VRML
    if (this.isTemplate)
      this.regenerateBodyVrml(); // overwrites this.protoBody with a purely VRML compliant body

    // change all relative paths to remote ones
    const re = /"(?:[^"]*)\.(jpe?g|png|hdr|obj|stl|dae)"/g;
    let result;
    while ((result = re.exec(this.protoBody)) !== null)
      this.protoBody = this.protoBody.replace(result[0], '"' + combinePaths(result[0].slice(1, -1), this.url) + '"');

    // tokenize body
    const tokenizer = new Tokenizer(this.protoBody, this);
    tokenizer.tokenize();

    // skip bracket opening the PROTO body
    tokenizer.skipToken('{');

    this.baseType = Node.createNode(tokenizer);

    tokenizer.skipToken('}');
  };

  configureNodeFromTokenizer(tokenizer) {
    tokenizer.skipToken('{');

    while (tokenizer.peekWord() !== '}') {
      const fieldName = tokenizer.nextWord();
      for (const [parameterName, parameter] of this.parameters) {
        if (fieldName === parameterName) {
          if (tokenizer.peekWord() === 'IS') {
            tokenizer.skipToken('IS');
            const alias = tokenizer.nextWord();
            if (!tokenizer.proto.parameters.has(alias))
              throw new Error('Alias "' + alias + '" not found in PROTO ' + this.name);

            const exposedParameter = tokenizer.proto.parameters.get(alias);
            parameter.value = exposedParameter.value.clone();
            exposedParameter.insertLink(parameter);
          } else
            parameter.value.setValueFromTokenizer(tokenizer, this);
        }
      }
    }

    tokenizer.skipToken('}');
  }

  toX3d(isUse, parameterReference) {
    this.xml = document.implementation.createDocument('', '', null);

    // if this node has a value (i.e. this.baseType is defined) then it means we have not yet reached the bottom as only
    // base-nodes should write x3d. If it has a value, then it means the current node is a derived PROTO.
    if (typeof this.baseType !== 'undefined')
      return this.baseType.toX3d();

    const nodeElement = this.xml.createElement(this.name);
    if (isUse)
      nodeElement.setAttribute('USE', this.id);
    else {
      nodeElement.setAttribute('id', this.id);
      for (const [parameterName, parameter] of this.parameters) {
        if (typeof parameter.value === 'undefined') // note: SFNode can be null, not undefined
          throw new Error('All parameters should be defined, ' + parameterName + ' is not.');

        if (parameter.isDefault())
          continue;

        parameter.value.toX3d(parameterName, nodeElement);
      }
    }

    this.xml.appendChild(nodeElement);

    return nodeElement;
  }

  toJS(isFirstNode = false) {
    let jsFields = '';
    for (const [parameterName, parameter] of this.parameters)
      jsFields += `${parameterName}: {value: ${parameter.value.toJS()}, defaultValue: ${parameter.defaultValue.toJS()}}, `;

    if (isFirstNode)
      return jsFields.slice(0, -2);

    return `{node_name: '${this.name}', fields: {${jsFields.slice(0, -2)}}}`;
  }

  toVrml() {
    let vrml = '';
    vrml += `${this.name}{`;
    for (const [parameterName, parameter] of this.parameters) {
      if (!parameter.isDefault())
        vrml += `${parameterName} ${parameter.value.toVrml()} `;
    }
    vrml += '}\n';

    return vrml.slice(0, -1);
  }

  regenerateBodyVrml() {
    const fieldsEncoding = this.toJS(true); // make current proto parameters in a format compliant to template engine

    if (typeof this.templateEngine === 'undefined')
      throw new Error('Regeneration was called but the template engine is not defined (i.e this.isTemplate is false)');

    this.protoBody = this.templateEngine.generateVrml(fieldsEncoding, this.rawBody);
  };

  regenerateNode(view, propagate = true) {
    const baseNodeId = this.getBaseNode().id;
    const node = WbWorld.instance.nodes.get(baseNodeId);
    if (typeof node !== 'undefined') {
      // delete existing node
      view.x3dScene.processServerMessage(`delete: ${baseNodeId.replace('n', '')}`);
      // regenerate the VRML and parse body
      this.parseBody(true);
      // insert new node
      const x3d = new XMLSerializer().serializeToString(this.toX3d());
      view.x3dScene.loadObject('<nodes>' + x3d + '</nodes>', node.parent.replace('n', ''));
    }

    if (!propagate)
      return;

    if (Node.cNodeSiblings.has(this.id)) {
      for (const sibling of Node.cNodeSiblings.get(this.id))
        sibling.regenerateNode(view, false); // prevent endless loop
    }
  }

  clearReferences() {
    this.def = new Map();

    for (const [, parameter] of this.parameters)
      parameter.resetParameterLinks();

    if (this.isRoot)
      Node.cNodeSiblings = new Map();
  };

  getParameterByName(name) {
    if (!this.parameters.has(name))
      throw new Error('Node ' + this.name + ' does not have a parameter named: ' + name);

    return this.parameters.get(name);
  }

  getBaseNode() {
    if (this.isProto)
      return this.baseType.getBaseNode();

    return this;
  }

  static createNode(tokenizer) {
    let defName;
    if (tokenizer.peekWord() === 'DEF') {
      tokenizer.skipToken('DEF');
      defName = tokenizer.nextWord();
    } else if (tokenizer.peekWord() === 'USE') {
      tokenizer.skipToken('USE');
      const useName = tokenizer.nextWord();
      if (!tokenizer.proto.def.has(useName))
        throw new Error('No DEF name ' + useName + ' found in PROTO ' + tokenizer.proto.name);

      return tokenizer.proto.def.get(useName);
    }

    const nodeName = tokenizer.nextWord();
    if (nodeName === 'NULL')
      return null;

    let node;
    if (typeof FieldModel[nodeName] !== 'undefined') { // it's a base node
      if (!Node.cBaseModels.has(nodeName)) {
        // create prototype if none is available
        const model = new Node(nodeName);
        Node.cBaseModels.set(nodeName, model);
      }

      node = Node.cBaseModels.get(nodeName).clone(true);
    } else { // it's a PROTO node
      // note: protoModels are expected to already contain models for all PROTO we need this session since these have been
      // downloaded when retrieving the EXTERNPROTO and a prototype for each should have been computed already
      if (!tokenizer.proto.externProto.has(nodeName))
        throw new Error('Node name ' + nodeName + ' is not recognized. Was it declared as EXTERNPROTO?');

      const url = tokenizer.proto.externProto.get(nodeName);
      if (!Node.cProtoModels.has(url))
        throw new Error('Model of PROTO ' + nodeName + ' not available. Was it declared as EXTERNPROTO?');

      node = Node.cProtoModels.get(url).clone(true);
    }

    if (typeof defName !== 'undefined')
      tokenizer.proto.def.set(defName, node);

    node.configureNodeFromTokenizer(tokenizer);
    if (node.isProto)
      node.parseBody();

    return node;
  }
};

function combinePaths(url, parentUrl) {
  if (url.startsWith('http://') || url.startsWith('https://'))
    return url; // url is already resolved

  if (url.startsWith('webots://')) {
    if (parentUrl.startsWith('http://') || parentUrl.startsWith('https://')) {
      // eslint-disable-next-line
      const match = parentUrl.match(/(https:\/\/raw.githubusercontent.com\/cyberbotics\/webots\/[a-zA-Z0-9\_\-\+]+\/)/);
      if (match === null) {
        console.warn('Expected prefix not found in parent url.');
        return url;
      }

      return url.replace('webots://', match[0]);
    } else
      return url;
  }

  let newUrl;
  if (parentUrl.startsWith('http://' || url.startsWith('https://')))
    newUrl = new URL(url, parentUrl.slice(0, parentUrl.lastIndexOf('/') + 1)).href;
  else
    newUrl = parentUrl.slice(0, parentUrl.lastIndexOf('/') + 1) + url;

  return newUrl;
}

export { Node };
