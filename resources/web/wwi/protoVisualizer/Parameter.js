'use strict';

import {MFNode, SFNode, stringifyType} from './Vrml.js';
import Node from './Node.js';
import { VRML } from './vrml_type.js';

export default class Parameter {
  #type;
  #name;
  #value;
  #defaultValue;
  #isTemplateRegenerator;
  #restrictions;
  #parameterLinks;
  constructor(node, name, type, restrictions, defaultValue, value, isTemplateRegenerator) {
    this.node = node; // node this parameter belongs to
    this.#type = type;
    this.#name = name;
    this.#restrictions = restrictions;
    this.defaultValue = defaultValue;
    this.value = value;
    this.#isTemplateRegenerator = isTemplateRegenerator;
    this.#parameterLinks = []; // list of other parameters to notify whenever this instance changes
  }

  get restrictions() {
    return this.#restrictions;
  }

  set restrictions(newValue) {
    this.#restrictions = newValue;
  }

  get value() {
    return this.#value;
  }

  set value(v) {
    if (v.type() !== this.type)
      throw new Error('Type mismatch, setting ' + stringifyType(v.type()) + ' to ' + stringifyType(this.type) + ' parameter.');

    if (this.restrictions.length > 0) {
      for (const item of this.restrictions) {
        if ((v instanceof SFNode && v.value === null) || item.equals(v)) {
          this.#value = v;
          return;
        }
      }

      throw new Error('Parameter ' + this.name + ' is restricted and the value being set is not permitted.');
    }

    this.#value = v;
  }

  get defaultValue() {
    return this.#defaultValue;
  }

  set defaultValue(v) {
    if (v.type() !== this.type)
      throw new Error('Type mismatch, setting ' + stringifyType(v.type()) + ' to ' + stringifyType(this.type) + ' parameter.');

    this.#defaultValue = v;
  }

  get type() {
    return this.#type;
  }

  set type(type) {
    this.#type = type;
  }

  get name() {
    return this.#name;
  }

  set name(value) {
    this.#name = value;
  }

  get isTemplateRegenerator() {
    return this.#isTemplateRegenerator;
  }

  set isTemplateRegenerator(value) {
    this.#isTemplateRegenerator = value;
  }

  get parameterLinks() {
    return this.#parameterLinks;
  }

  resetParameterLinks() {
    this.#parameterLinks = [];
  }

  insertLink(parameter) {
    this.#parameterLinks.push(parameter);
  }

  // TODO: find better approach rather than propagating the view to subsequent parameters
  setValueFromJavaScript(view, v, index) {
    // notify linked parameters of the change
    for (const link of this.parameterLinks)
      link.setValueFromJavaScript(view, (v !== null && v instanceof Node) ? v.clone() : v, index);

    if (this.isTemplateRegenerator) {
      // regenerate this node, and all its siblings
      this.#value.setValueFromJavaScript(v, index);
      this.node.regenerateNode(view);

      if (typeof this.onChange === 'function')
        this.onChange();
    } else {
      if (this.node.isProto) {
        // update value on the structure side
        this.#value.setValueFromJavaScript(v, index);
        return; // webotsJS needs to be notified of parameter changes only if the parameter belongs to a base-node, not PROTO
      }

      if (this.#value instanceof SFNode) {
        const baseNode = this.node.getBaseNode();
        if (this.#value.value !== null) {
          // delete existing node
          const p = baseNode.getParameterByName(this.name);
          const id = p.value.value.getBaseNode().id;

          view.x3dScene.processServerMessage(`delete: ${id.replace('n', '')}`);
        }

        // update value on the structure side
        this.#value.setValueFromJavaScript(v);

        if (v !== null) {
          // get the parent id to insert the new node
          const parentId = baseNode.id.replace('n', '');

          const x3d = new XMLSerializer().serializeToString(v.toX3d());
          view.x3dScene.loadObject('<nodes>' + x3d + '</nodes>', parentId);
        }
      } else if (this.#value instanceof MFNode) {
        const baseNode = this.node.getBaseNode();
        console.log('need del?', this.#value.value)
        if (this.#value.value.length > 0) {
          console.log('DELETE EXISTING NODES')
          // delete existing node
          const p = baseNode.getParameterByName(this.name);
          //p.value.value.forEach((item) => {
          //  const id = item.value.getBaseNode().id;
          //  view.x3dScene.processServerMessage(`delete: ${id.replace('n', '')}`);
          //});

          const id = p.value.value[index].value.getBaseNode().id;
          view.x3dScene.processServerMessage(`delete: ${id.replace('n', '')}`);
        }

        console.log('SETVALUEFROMJS:', v)
        // update value on the structure side
        this.#value.setValueFromJavaScript(v, index);

        // get the parent id to insert the new node
        const parentId = baseNode.id.replace('n', '');

        v.forEach((item) => {
          const x3d = new XMLSerializer().serializeToString(item.toX3d());
          view.x3dScene.loadObject('<nodes>' + x3d + '</nodes>', parentId);
        });
      } else {
        // update value on the structure side
        this.#value.setValueFromJavaScript(v);

        // update value on the webotsJS side
        const action = {};
        action['id'] = this.node.id;
        action[this.name] = this.value.toJson();
        console.log('setPose', action);
        view.x3dScene.applyPose(action);
      }
      view.x3dScene.render();
    }
  }

  isDefault() {
    if (typeof this.defaultValue === 'undefined' || typeof this.value === 'undefined')
      throw new Error('Cannot check default-ness, either "value" or "defaultValue" is undefined.');

    return this.value.equals(this.defaultValue);
  }

  clone(deep = false) {
    const restrictions = [];
    for (const item of this.restrictions)
      restrictions.push(item.clone(deep));

    const copy = new Parameter(this.node, this.name, this.type, restrictions,
      deep ? this.defaultValue.clone(deep) : this.defaultValue,
      deep ? this.value.clone(deep) : this.value, this.isTemplateRegenerator);

    return copy;
  }
}

export { Parameter };
