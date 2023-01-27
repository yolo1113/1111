'use strict';

import {SFNode, stringifyType} from './Vrml.js';
import Node from './Node.js';
import {VRML} from './vrml_type.js';
import WbWorld from '../nodes/WbWorld.js';
import Field from './Field.js';

export default class Parameter extends Field {
  #restrictions;
  #parameterLinks; // rename to IS links
  #isTemplateRegenerator;
  constructor(node, name, type, defaultValue, value, restrictions, isTemplateRegenerator) {
    super(node, name, type, value, defaultValue);

    this.#restrictions = restrictions;
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
    return super.value;
  }

  set value(newValue) {
    if (newValue.type() !== this.type)
      throw new Error('Type mismatch, setting ' + stringifyType(newValue.type()) + ' to ' + stringifyType(this.type) + ' parameter.');

    if (this.restrictions.length > 0) {
      for (const item of this.restrictions) {
        if ((newValue instanceof SFNode && newValue.value === null) || item.equals(newValue)) {
          super.value = newValue;
          return;
        }
      }

      throw new Error('Parameter ' + this.name + ' is restricted and the value being set is not permitted.');
    }

    super.value = newValue;
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

  set parameterLinks(newValue) {
    this.#parameterLinks = newValue;
  }

  insertLink(parameter) { // TODO: rename
    this.#parameterLinks.push(parameter);
  }

  insertNode(view, v, index) {
    if (this.type !== VRML.MFNode)
      throw new Error('Item insertion is possible only for MFNodes.')

    const links = this.linksToNotify();
    for (const link of links) {
      console.log('PARENT:', link.node.name, link.node.getBaseNodeIds())
    }

    this.value.insertNode(v, index);

    // insert the new node on the webotsjs side
    for (const id of this.node.getBaseNodeIds()) {
      v.assignId();
      const x3d = new XMLSerializer().serializeToString(v.toX3d());
      view.x3dScene.loadObject('<nodes>' + x3d + '</nodes>', id.replace('n', ''));
    }

    console.log('after insertion', this);


    /*
    //for (const link of this.parameterLinks)
    //  link.insertNode(view, v.clone(), index);

    //if (this.node.isProto) { // add value on the structure side
      this.#value.insertNode(v, index);
    //  return; // webotsJS needs to be notified of parameter changes only if the parameter belongs to a base-node, not PROTO
    //}

    // get the parent id to insert the new node
    const parentId = this.node.getBaseNode().id.replace('n', '');
    const x3d = new XMLSerializer().serializeToString(v.toX3d());
    view.x3dScene.loadObject('<nodes>' + x3d + '</nodes>', parentId);
    this.#value.insertNode(v, index); // add value on the structure side
    */
    console.log(WbWorld.instance.nodes)
    view.x3dScene.render();
  }

  removeNode(view, index) {
    if (this.type !== VRML.MFNode)
      throw new Error('Item insertion is possible only for MFNodes.');

    console.log('removeNode at index', index);

    const links = this.linksToNotify();
    const idsToDelete = new Set();

    // TODO: can simplify by just deleting and requesting the parent from webotsjs?
    for (const link of links) {
      // determine ids of nodes that need to be deleted on the webotsjs side
      for (const id of link.value.value[index].value.getBaseNodeIds())
        idsToDelete.add(id);
    }

    console.log('ids to delete', idsToDelete);

    // delete node on the structure side
    this.value.removeNode(index);

    // delete existing nodes
    for (const id of idsToDelete)
      view.x3dScene.processServerMessage(`delete: ${id.replace('n', '')}`);

    /*
    //for (const link of this.parameterLinks)
    //  link.removeNode(view, index);

    if (this.node.isProto) { // update value on the structure side
      this.#value.removeNode(index);
      return; // webotsJS needs to be notified of parameter changes only if the parameter belongs to a base-node, not PROTO
    }

    if (this.#value.value.length > 0) {
      // delete existing node
      const baseNode = this.node.getBaseNode();
      const p = baseNode.getParameterByName(this.name);
      const id = p.value.value[index].value.getBaseNode().id;

      view.x3dScene.processServerMessage(`delete: ${id.replace('n', '')}`);
      this.#value.removeNode(index); // update value on the structure side
    }
    */

    console.log('after removal', this)
    console.log(WbWorld.instance.nodes)
    view.x3dScene.render();
  }

  setValueFromJavaScript(view, v, index) {
    console.log(this.name, 'paramlinks', this.parameterLinks)
    console.log(this.name, ': change to ', v, 'node:', this.node)

    if (this.isTemplateRegenerator) {
      console.log(this.name, 'is a template regenerator!')

      const parentIds = new Set();
      for (const id of this.node.getBaseNodeIds()) {
        const jsNode = WbWorld.instance.nodes.get(id);
        parentIds.add(jsNode.parent);

        console.log('requesting deletion for node:', id, 'parent is', jsNode.parent);
        view.x3dScene.processServerMessage(`delete: ${id.replace('n', '')}`);
      }

      // update the parameter value (note: all IS instances refer to the parameter itself, so they don't need to change)
      this.value.setValueFromJavaScript(v);
      this.node.createBaseType(); // regenerate the base type

      this.node.resetRefs(); // reset the instance counters
      // insert the new node on the webotsjs side
      for (const id of parentIds) {
        // note: there must be as many id assignments as there are parents, this is because on the webotsjs side the instances
        // need to be distinguishable, so each "IS" needs to notify webotsjs and provide a unique variant of the x3d (with unique ids)
        // for each node
        this.node.assignId();
        const x3d = new XMLSerializer().serializeToString(this.node.toX3d());
        view.x3dScene.loadObject('<nodes>' + x3d + '</nodes>', id.replace('n', ''));
      }

      view.x3dScene.render();
      return;
    }

    if (v instanceof Node || v === null) {
      const links = this.linksToNotify();
      const parentIds = new Set();
      const idsToDelete = new Set();

      // TODO: can simplify by just deleting and requesting the parent from webotsjs?
      for (const link of links) {
        // determine parent node ids and ids of nodes that need to be deleted on the webotsjs side
        for (const id of link.node.getBaseNodeIds()) {
          parentIds.add(id);

          if (link.value.value !== null) {
            for (const id of link.value.value.getBaseNodeIds())
              idsToDelete.add(id);
          }
        }
      }

      console.log('parent ids: ', parentIds, 'ids to delete', idsToDelete);

      // delete existing nodes
      for (const id of idsToDelete)
        view.x3dScene.processServerMessage(`delete: ${id.replace('n', '')}`);

      // update the parameter value (note: all IS instances refer to the parameter itself, so they don't need to change)
      this.value.setValueFromJavaScript(v);

      if (v !== null) {
        // insert the new node on the webotsjs side
        for (const parent of parentIds) {
          // note: there must be as many id assignments as there are parents, this is because on the webotsjs side the instances
          // need to be distinguishable, so each "IS" needs to notify webotsjs and provide a unique variant of the x3d (with unique ids)
          // for each node
          v.assignId();
          const x3d = new XMLSerializer().serializeToString(v.toX3d());
          view.x3dScene.loadObject('<nodes>' + x3d + '</nodes>', parent.replace('n', ''));
        }
      }
    } else {
      console.log('pose change required')
      // update the parameter
      this.value.setValueFromJavaScript(v);

      const links = this.linksToNotify();
      console.log('links to notify', links)
      for (const link of links) {
        for (const id of link.node.ids) {
          const action = {}
          action['id'] = id;
          action[link.name] = this.value.toJson();
          console.log('setPose', action);
          view.x3dScene.applyPose(action);
        }
      }
    }

    view.x3dScene.render();
    console.log(WbWorld.instance.nodes)
  }


  linksToNotify() {
    let links = [];
    for (const link of this.parameterLinks) {
      if (link instanceof Parameter && link.parameterLinks.length > 0)
        links = links.concat(link.linksToNotify());

      if (!link.node.isProto)
        links.push(link);
    }

    return links;
  }

  // TODO: find better approach rather than propagating the view to subsequent parameters
  /*
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
        if (this.#value.value.length > 0) { // delete existing node
          const p = baseNode.getParameterByName(this.name);
          const id = p.value.value[index].value.getBaseNode().id;
          view.x3dScene.processServerMessage(`delete: ${id.replace('n', '')}`);
        }

        // update value on the structure side
        this.#value.setValueFromJavaScript(v, index);

        // get the parent id to insert the new node and notify webotsjs
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
  */
}

export { Parameter };
