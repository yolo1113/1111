export default class WbVector4 {
  constructor(x = 0.0, y = 0.0, z = 0.0, w = 0.0) {
    if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number' || typeof w !== 'number')
      throw new Error('Expected Numbers in WbVector4 constructor');

    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
  }

  div(number) {
    return new WbVector4(this.x / number, this.y / number, this.z / number, this.w / number);
  }

  equal(vector) {
    return this.x === vector.x && this.y === vector.y && this.z === vector.z && this.w === vector.w;
  }

  clone() {
    return new WbVector4(this.x, this.y, this.z, this.w);
  };
}
