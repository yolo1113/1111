import WbSolid from './WbSolid.js';
import WbWrenRenderingContext from '../wren/WbWrenRenderingContext.js';
import WbWrenShaders from '../wren/WbWrenShaders.js';
import {arrayXPointerFloat} from './utils/utils.js';

// This class is used to retrieve the type of device
export default class WbPen extends WbSolid {
  #material;
  #mesh;
  #renderable;
  #transform;
  #write;
  constructor(id, translation, scale, rotation, name, write) {
    super(id, translation, scale, rotation, name);
    this.#write = write;
  }

  get write() {
    return this.#write;
  }

  set write(newWrite) {
    this.#write = newWrite;
    this.#update();
  }

  createWrenObjects() {
    super.createWrenObjects();

    const coords = [0, 0, -1, 0, 0, 0];
    const coordsPointer = arrayXPointerFloat(coords);
    this.#transform = _wr_transform_new();
    this.#renderable = _wr_renderable_new();
    this.#material = _wr_phong_material_new();

    this.#mesh = _wr_static_mesh_line_set_new(2, coordsPointer, undefined);
    _free(coordsPointer);

    const color = _wrjs_array3(0.5, 0.5, 0.5);
    _wr_phong_material_set_color(this.#material, color);
    _wr_material_set_default_program(this.#material, WbWrenShaders.lineSetShader());

    _wr_renderable_set_drawing_mode(this.#renderable, Enum.WR_RENDERABLE_DRAWING_MODE_LINES);
    _wr_renderable_set_mesh(this.#renderable, this.#mesh);
    _wr_renderable_set_material(this.#renderable, this.#material, undefined);
    _wr_renderable_set_cast_shadows(this.#renderable, false);
    _wr_renderable_set_receive_shadows(this.#renderable, false);
    _wr_renderable_set_visibility_flags(this.#renderable, WbWrenRenderingContext.VM_REGULAR);

    _wr_transform_attach_child(this.#transform, this.#renderable);
    _wr_transform_attach_child(this.wrenNode, this.#transform);
    _wr_node_set_visible(this.#transform, false);

    this.#applyOptionalRenderingToWren();
  }

  applyOptionalRendering(enable) {
    _wr_node_set_visible(this.#transform, enable);
  }

  #applyOptionalRenderingToWren() {
    if (!this.wrenObjectsCreatedCalled)
      return;

    const lineScale = _wr_config_get_line_scale();
    const scale = _wrjs_array3(lineScale, lineScale, lineScale);
    _wr_transform_set_scale(this.#transform, scale);

    if (this.#write) {
      const enabledColor = _wrjs_array3(0.5, 0, 1);
      _wr_phong_material_set_color(this.#material, enabledColor);
    } else {
      const disabledColor = _wrjs_array3(0.5, 0.5, 0.5);
      _wr_phong_material_set_color(this.#material, disabledColor);
    }
  }

  #update() {
    if (this.wrenObjectsCreatedCalled)
      this.#applyOptionalRenderingToWren();
  }
}
