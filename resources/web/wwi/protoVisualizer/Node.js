'use strict';

import {getAnId} from '../nodes/utils/id_provider.js';
import TemplateEngine from './TemplateEngine.js';
import Tokenizer from './Tokenizer.js';
import {vrmlFactory} from './Vrml.js';
import {isBaseNode, FieldModel} from './FieldModel.js';
import {Parameter} from './Parameter.js';
import Field from './Field.js';
import { VRML } from './vrml_type.js';

export default class Node {
  static cProtoModels = new Map();

  constructor(url, parameterTokenizer, isRoot = false) {
    this.url = url;
    this.isProto = this.url.toLowerCase().endsWith('.proto');
    this.name = this.isProto ? this.url.slice(this.url.lastIndexOf('/') + 1).replace('.proto', '') : url;

    this.fields = new Map(); // fields are defined only for base nodes, PROTO nodes have a baseType and parameters
    this.parameters = new Map(); // defines the exposed parameters of a PROTO, hence base-nodes have not parameters
    this.def = new Map();

    this.isDerived = false; // updated when the model is determined, false for base-nodes
    this.isTemplate = false; // updated when the model is determined, false for base-nodes

    this.ids = []; // multiple instances of the same node might be present in a node structure, this list tracks their id
    this.refId = 0; // when writing the x3d, this counter ensures unique ids (among the this.ids list) are fed to webotsjs
    this.isRoot = isRoot; // determines if the current node is the root node

    // create parameters based on the PROTO model
    if (this.isProto) {
      console.assert(Node.cProtoModels.has(this.url), `A PROTO model should be available for ${this.name} by now.`);
      this.model = Node.cProtoModels.get(this.url);
      this.isDerived = !isBaseNode(this.model['baseType']);

      this.externProto = this.model['externProto'];
      this.isTemplate = this.model['isTemplate'];

      for (const [parameterName, parameterModel] of Object.entries(this.model['parameters'])) {
        const parameterType = parameterModel['type'];
        const isTemplateRegenerator = parameterModel['isTemplateRegenerator'];
        const restrictions = parameterModel['restrictions'];
        const initializer = parameterModel['defaultValue'];
        initializer.rewind(); // TODO: improve
        const defaultValue = vrmlFactory(parameterType, initializer);
        initializer.rewind();
        const value = vrmlFactory(parameterType, initializer);

        const parameter = new Parameter(this, parameterName, parameterType, defaultValue, value, restrictions,
          isTemplateRegenerator);
        this.parameters.set(parameterName, parameter);
      }

      // configure the parameters based on the VRML provided in the PROTO body (typically, in a derived PROTO context,
      // sub-PROTO parameters are overwritten by the parent PROTO)
      if (typeof parameterTokenizer !== 'undefined' && parameterTokenizer.hasMoreTokens())
        this.configureParametersFromTokenizer(parameterTokenizer);
    } else
      this.model = FieldModel[this.name];

    if (this.isProto)
      this.createBaseType();
    else // only when reaching the bottom of the PROTO chain the internal fields are created
      this.generateInternalFields();

    if (this.isRoot)
      this.assignId(); // navigates through the base-nodes of the structure, and fills the "this.ids" list
  };

  generateInternalFields() {
    // set field values based on field model
    for (const fieldName of Object.keys(this.model)) {
      const type = this.model[fieldName]['type'];
      const value = vrmlFactory(type, this.model[fieldName]['defaultValue']);
      const defaultValue = vrmlFactory(type, this.model[fieldName]['defaultValue']);
      const field = new Field(this, fieldName, type, defaultValue, value);
      this.fields.set(fieldName, field);
    }
  }

  getBaseNode() {
    if (this.isProto) {
      console.assert(typeof this.baseType !== 'undefined');
      return this.baseType.getBaseNode();
    }

    return this;
  }

  createBaseType() {
    this.def = new Map(); // recreate def list
    let protoBody = this.model['rawBody'];

    if (this.isTemplate)
      protoBody = this.regenerateBodyVrml(protoBody);

    // configure non-default fields from tokenizer
    const tokenizer = new Tokenizer(protoBody, this, this.externProto);
    tokenizer.tokenize();

    if (this.isDerived) {
      console.assert(this.externProto.has(this.model['baseType']));
      const baseTypeUrl = this.externProto.get(this.model['baseType']);
      this.baseType = new Node(baseTypeUrl, tokenizer);
    } else {
      this.baseType = new Node(this.model['baseType']);
      this.baseType.configureFieldsFromTokenizer(tokenizer); // base-nodes don't have parameters
    }
  }

  configureParametersFromTokenizer(tokenizer) {
    tokenizer.skipToken('{');

    while (tokenizer.peekWord() !== '}') {
      const field = tokenizer.nextWord();
      for (const [parameterName, parameterValue] of this.parameters) {
        if (field === parameterName) {
          if (tokenizer.peekWord() === 'IS') {
            tokenizer.skipToken('IS');
            const alias = tokenizer.nextWord();
            if (!tokenizer.proto.parameters.has(alias))
              throw new Error('Alias "' + alias + '" not found in PROTO ' + tokenizer.proto.name);

            const p = tokenizer.proto.parameters.get(alias);
            parameterValue.value = p.value;
            p.insertLink(parameterValue); // TODO: rename
          } else
            parameterValue.value.setValueFromTokenizer(tokenizer, this);
        }
      }
    }

    tokenizer.skipToken('}');
  }

  configureFieldsFromTokenizer(tokenizer) { // TODO: merge with other
    tokenizer.skipToken('{');

    while (tokenizer.peekWord() !== '}') {
      const field = tokenizer.nextWord();
      for (const [fieldName, fieldValue] of this.fields) {
        if (field === fieldName) {
          if (tokenizer.peekWord() === 'IS') {
            tokenizer.skipToken('IS');
            const alias = tokenizer.nextWord();
            if (!tokenizer.proto.parameters.has(alias))
              throw new Error('Alias "' + alias + '" not found in PROTO ' + tokenizer.proto.name);

            const p = tokenizer.proto.parameters.get(alias);
            fieldValue.value = p.value;
            p.insertLink(fieldValue);
          } else
            fieldValue.value.setValueFromTokenizer(tokenizer);
        }
      }
    }

    tokenizer.skipToken('}');
  }

  printStructure(depth = 0) { // for debugging purposes
    const index = '--'.repeat(depth);
    if (this.isProto)
      return this.baseType.printStructure(depth);

    console.log(index + this.name, this.ids);

    for (const [fieldName, field] of this.fields) {
      console.log(index + fieldName);
      if (field.type === VRML.SFNode && field.value.value !== null)
        field.value.value.printStructure(depth + 1);
      else if (field.type === VRML.MFNode) {
        for (const child of field.value.value)
          child.value.printStructure(depth + 1);
      }
    }
  }

  assignId() {
    // note: ids are assigned only to base-nodes, PROTO nodes don't need one
    if (this.isProto)
      return this.baseType.assignId();

    this.ids.push(getAnId());

    for (const field of this.fields.values()) {
      if (field.type === VRML.SFNode && field.value.value !== null)
        field.value.value.assignId();
      else if (field.type === VRML.MFNode) {
        for (const child of field.value.value)
          child.value.assignId();
      }
    }
  }

  getBaseNodeIds() {
    if (this.isProto)
      return this.baseType.getBaseNodeIds();

    return this.ids;
  }

  resetRefs() {
    if (this.isProto)
      return this.baseType.resetRefs();

    this.refId = 0;

    for (const field of this.fields.values()) {
      if (field.type === VRML.SFNode && field.value.value !== null)
        field.value.value.resetRefs();
      else if (field.type === VRML.MFNode) {
        for (const child of field.value.value)
          child.value.resetRefs();
      }
    }
  }

  toX3d(isUse) {
    if (this.isRoot)
      this.resetRefs(); // resets the instance counters

    this.xml = document.implementation.createDocument('', '', null);

    if (this.isProto)
      return this.baseType.toX3d();

    const nodeElement = this.xml.createElement(this.name);
    if (isUse)
      nodeElement.setAttribute('USE', this.ids[0]);
    else {
      if (this.refId > this.ids.length - 1)
        throw new Error('Something has gone wrong, the refId is bigger the number of available ids.');
      const id = this.ids[this.refId++];
      nodeElement.setAttribute('id', id);
      for (const [fieldName, field] of this.fields) {
        if (field.isDefault())
          continue;

        field.value.toX3d(fieldName, nodeElement);
      }
    }

    this.xml.appendChild(nodeElement);
    return nodeElement;
  }

  regenerateBodyVrml(protoBody) {
    const fieldsEncoding = this.toJS(true); // make current proto parameters in a format compliant to template engine
    const templateEngine = new TemplateEngine(Math.abs(getAnId().replace('n', '')), this.model['version']);

    return templateEngine.generateVrml(fieldsEncoding, protoBody);
  };

  toJS(isFirstNode = false) {
    let jsFields = '';
    for (const [parameterName, parameter] of this.parameters)
      jsFields += `${parameterName}: {value: ${parameter.value.toJS()}, defaultValue: ${parameter.defaultValue.toJS()}}, `;

    if (isFirstNode)
      return jsFields.slice(0, -2);

    return `{node_name: '${this.name}', fields: {${jsFields.slice(0, -2)}}}`;
  }

  static async prepareProtoDependencies(protoUrl) {
    return new Promise((resolve, reject) => {
      const xmlhttp = new XMLHttpRequest();
      xmlhttp.open('GET', protoUrl, true);
      xmlhttp.overrideMimeType('plain/text');
      xmlhttp.onreadystatechange = async() => {
        // Some browsers return HTTP Status 0 when using non-http protocol (for file://)
        if (xmlhttp.readyState === 4 && (xmlhttp.status === 200 || xmlhttp.status === 0))
          resolve(xmlhttp.responseText);
      };
      xmlhttp.send();
    }).then(async text => {
      const indexBeginInterface = text.search(/(^\s*PROTO\s+[a-zA-Z0-9\-_+]+\s*\[\s*$)/gm);
      const rawHeader = text.substring(0, indexBeginInterface);

      const promises = [];
      const externProto = new Map();
      const lines = rawHeader.split('\n');
      for (const line of lines) {
        if (line.indexOf('EXTERNPROTO') !== -1) { // get only the text after 'EXTERNPROTO'
          let address = line.split('EXTERNPROTO')[1].trim().replaceAll('"', '');
          if (address.startsWith('webots://'))
            address = 'https://raw.githubusercontent.com/cyberbotics/webots/R2023a/' + address.substring(9);
          else
            address = combinePaths(address, protoUrl);

          const protoName = address.split('/').pop().replace('.proto', '');
          externProto.set(protoName, address);
          promises.push(await Node.prepareProtoDependencies(address));
        }
      }

      Promise.all(promises).then(async() => this.generateProtoModel(protoUrl, text, externProto));
    });
  }

  static async generateProtoModel(protoUrl, protoText, externProto) {
    if (Node.cProtoModels.has(protoUrl))
      return; // model is known already

    const indexBeginInterface = protoText.search(/(^\s*PROTO\s+[a-zA-Z0-9\-_+]+\s*\[\s*$)/gm);
    const indexBeginBody = protoText.search(/(?<=\]\s*\n*\r*)({)/g);

    const rawHeader = protoText.substring(0, indexBeginInterface);
    let rawInterface = protoText.substring(indexBeginInterface, indexBeginBody);

    // change all relative paths to remote ones
    const re = /"(?:[^"]*)\.(jpe?g|png|hdr|obj|stl|dae)"/g;
    let result;
    while ((result = re.exec(rawInterface)) !== null)
      rawInterface = rawInterface.replace(result[0], '"' + combinePaths(result[0].slice(1, -1), protoUrl) + '"');

    let rawBody = protoText.substring(indexBeginBody);
    // change all relative paths to remote ones
    while ((result = re.exec(rawBody)) !== null)
      rawBody = rawBody.replace(result[0], '"' + combinePaths(result[0].slice(1, -1), protoUrl) + '"');

    const tokenizer = new Tokenizer(rawInterface, this, externProto);
    tokenizer.tokenize();

    // build parameter list
    tokenizer.skipToken('PROTO');
    this.protoName = tokenizer.nextWord();

    const model = {};
    model['rawBody'] = rawBody;
    model['isTemplate'] = protoText.substring(0, indexBeginInterface).search('template language: javascript') !== -1;
    const match = rawHeader.match(/R(\d+)([a-z])(?:\srevision\s(\d+)|-rev(\d+))?(?:-(\w*))?(?:-(\w*\/\w*\/\w*))?/);
    model['version'] = {'major': parseInt(match[1]), 'revision': typeof match[4] === 'undefined' ? 0 : parseInt(match[4])};
    model['externProto'] = externProto;
    model['baseType'] = rawBody.match(/\{\s*(?:%<[\s\S]*?(?:>%\s*))?(?:DEF\s+[^\s]+)?\s+([a-zA-Z0-9_\-+]+)\s*\{/)[1];
    model['parameters'] = {};

    while (!tokenizer.peekToken().isEof()) {
      const token = tokenizer.nextToken();
      let nextToken = tokenizer.peekToken();

      const restrictions = [];
      if (token.isKeyword() && nextToken.isPunctuation()) {
        if (nextToken.word() === '{') {
          // parse field restrictions
          tokenizer.skipToken('{');
          const parameterType = token.fieldTypeFromVrml();

          while (tokenizer.peekWord() !== '}') {
            // TODO: handle MF/SFNode restrictions (encode urls?)
            const value = vrmlFactory(parameterType, tokenizer);
            restrictions.push(value);
          }

          tokenizer.skipToken('}');
          nextToken = tokenizer.peekToken(); // we need to update the nextToken as it has to point after the restrictions
        }
      }

      if (token.isKeyword() && nextToken.isIdentifier()) {
        const parameterName = nextToken.word();
        const parameterType = token.fieldTypeFromVrml();
        const isRegenerator = rawBody.search('fields.' + parameterName + '.') !== -1;
        tokenizer.nextToken(); // consume the token containing the parameter name
        const defaultValue = tokenizer.spliceTokenizerByType(parameterType);
        const parameter = {};
        parameter['type'] = parameterType;
        parameter['defaultValue'] = defaultValue;
        parameter['isTemplateRegenerator'] = isRegenerator;
        parameter['restrictions'] = restrictions;
        model['parameters'][parameterName] = parameter;
      }
    }

    Node.cProtoModels.set(protoUrl, model);
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
