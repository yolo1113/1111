'use strict';

import {SFNode, stringifyType} from './Vrml.js';
import Field from './Field.js';

export default class Parameter extends Field {
  #aliasLinks;
  #reverseAliasLinks;
  #hidden;
  #isTemplateRegenerator;
  constructor(node, name, type, defaultValue, value, restrictions, isTemplateRegenerator, hidden) {
    super(node, name, type, value, defaultValue);

    this.restrictions = restrictions;
    this.#isTemplateRegenerator = isTemplateRegenerator;
    this.#aliasLinks = []; // list of other parameters to notify whenever this instance changes
    this.#reverseAliasLinks = []; // list of parameters that have this parameter as IS link
    this.#hidden = hidden;
  }

  get value() {
    return super.value;
  }

  set value(newValue) {
    if (newValue.type() !== this.type)
      throw new Error(`Type mismatch, setting ${stringifyType(newValue.type())} to ${stringifyType(this.type)} parameter.`);

    if (this.restrictions.length > 0) {
      for (const item of this.restrictions) {
        if ((newValue instanceof SFNode && newValue.value === null) || item.equals(newValue)) {
          super.value = newValue;
          return;
        }
      }

      throw new Error(`Parameter ${this.name} is restricted and the value being set is not permitted.`);
    }

    super.value = newValue;
  }

  get hidden() {
    return this.#hidden;
  }

  get isTemplateRegenerator() {
    return this.#isTemplateRegenerator;
  }

  set isTemplateRegenerator(value) {
    console.log('SETTING', this.name, 'TO', value)
    this.#isTemplateRegenerator = value;
    if (this.#isTemplateRegenerator) {
      // if this parameter was set as template regenerator after the creation of the parameter instance, it means a IS link was
      // present in the body and therefore the information needs to be propagated upwards to all IS parameters in the chain
      for (const item of this.#reverseAliasLinks) {
        console.log('~~ ', this.name, 'is a regenerator, need to notify', item.name)
        item.isTemplateRegenerator = this.isTemplateRegenerator
        //console.log(this.name, '(', this.isTemplateRegenerator, ')',  'aliases', item.name, '(', item.isTemplateRegenerator, ')')
        //item.isTemplateRegenerator = value;
      }
    }
  }

  get aliasLinks() {
    return this.#aliasLinks;
  }

  set aliasLinks(newValue) {
    this.#aliasLinks = newValue;
  }

  get reverseAliasLinks() {
    return this.#reverseAliasLinks;
  }

  addAliasLink(parameter) {
    this.#aliasLinks.push(parameter);

    if (parameter instanceof Parameter) {
      parameter.reverseAliasLinks.push(this);
      console.log('ADDING', parameter.name, 'AS ALIAS OF', this.name)
      console.log('ADDING', this.name, 'AS REVERSE ALIAS OF', parameter.name)
    }
    //console.log('-- REVERSE ALIASES OF:', parameter.name, 'ARE: ')
    //for (const item of parameter.#reverseAliasLinks)
    //  console.log('---- ', item.name)

    if (parameter.isTemplateRegenerator){
      //console.log('--->', parameter.name, ' IS template regenerator, notify', this.name)
      this.isTemplateRegenerator = parameter.isTemplateRegenerator;
    }
  }

  resetAliasLinks() {
    console.log('CLEARING', this.name, this.#reverseAliasLinks)
    this.#aliasLinks = [];
    //for (const item of this.#reverseAliasLinks) {
    //  item.
    //}
  }

  printParameterLinks(depth = 1) {
    const indent = '--'.repeat(depth);
    for (const alias of this.#aliasLinks) {
      console.log(indent + ' ' + alias.name, ', reverse: ', alias.reverseAliasLinks[0].name);
      alias.printParameterLinks(depth + 1)
    }
  }

  linksToNotify() {
    let links = [];
    for (const link of this.aliasLinks) {
      if (link instanceof Parameter && link.aliasLinks.length > 0)
        links = links.concat(link.linksToNotify());

      if (!link.node.isProto)
        links.push(link);
    }

    return links;
  }
}

export { Parameter };
