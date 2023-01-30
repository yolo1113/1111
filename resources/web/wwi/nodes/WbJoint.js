import WbBaseNode from './WbBaseNode.js';
import WbSlot from './WbSlot.js';
import WbSolid from './WbSolid.js';
import WbWorld from './WbWorld.js';

export default class WbJoint extends WbBaseNode {
  #endPoint;
  #jointParameters;

  get endPoint() {
    return this.#endPoint;
  }

  set endPoint(endPoint) {
    this.#endPoint = endPoint;
  }

  get jointParameters() {
    return this.#jointParameters;
  }

  set jointParameters(jointParameters) {
    this.#jointParameters = jointParameters;

    if (typeof this.#jointParameters !== 'undefined')
      this.#jointParameters.onChange = () => this._updatePosition();
  }

  boundingSphere() {
    const solid = this.solidEndPoint();
    return solid?.boundingSphere();
  }

  createWrenObjects() {
    super.createWrenObjects();

    this.#endPoint?.createWrenObjects();
  }

  delete() {
    const parent = WbWorld.instance.nodes.get(this.parent);
    if (typeof parent !== 'undefined') {
      if (typeof parent.endPoint !== 'undefined')
        parent.endPoint = undefined;
      else {
        const index = parent.children.indexOf(this);
        parent.children.splice(index, 1);
      }
    }

    this.#jointParameters?.delete();
    this.#endPoint?.delete();

    super.delete();
  }

  preFinalize() {
    super.preFinalize();

    super.position = typeof this.jointParameters === 'undefined' ? 0 : this.jointParameters.position;
    this._updateEndPointZeroTranslationAndRotation();

    this.#jointParameters?.preFinalize();
    this.#endPoint?.preFinalize();
  }

  postFinalize() {
    super.postFinalize();

    this.#jointParameters?.postFinalize();
    this.#endPoint?.postFinalize();
  }

  solidEndPoint() {
    if (typeof this.endPoint === 'undefined')
      return;

    if (this.endPoint instanceof WbSlot) {
      const childrenSlot = this.endPoint.slotEndPoint();
      if (typeof childrenSlot !== 'undefined') {
        const slot = childrenSlot.slotEndPoint();
        return typeof slot !== 'undefined' ? slot.solidEndPoint() : undefined;
      }
    } else if (this.endPoint instanceof WbSolid)
      return this.endPoint;
  }

  updateBoundingObjectVisibility() {
    this.#endPoint?.updateBoundingObjectVisibility();
  }

  _updatePosition() {}
  _updateEndPointZeroTranslationAndRotation() {}
}
