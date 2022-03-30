// Copyright 1996-2022 Cyberbotics Ltd.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

#include "WbColladaShape.hpp"

#include "WbBackground.hpp"
#include "WbDownloader.hpp"
#include "WbMFString.hpp"
#include "WbNetwork.hpp"
#include "WbNodeReader.hpp"  // TODO: can remove probably
#include "WbNodeUtilities.hpp"
#include "WbPbrAppearance.hpp"
#include "WbRgb.hpp"
#include "WbSolid.hpp"
#include "WbTokenizer.hpp"
#include "WbUrl.hpp"
#include "WbViewpoint.hpp"
#include "WbWorld.hpp"  // TODO: can remove probably
#include "WbWrenPicker.hpp"
#include "WbWrenRenderingContext.hpp"
#include "WbWrenShaders.hpp"

#include <QtCore/QFileInfo>

#include <wren/material.h>
#include <wren/node.h>
#include <wren/renderable.h>
#include <wren/static_mesh.h>
#include <wren/transform.h>

#include <assimp/postprocess.h>
#include <assimp/scene.h>
#include <assimp/Importer.hpp>

void WbColladaShape::init() {
  mUrl = findMFString("url");
  mCcw = findSFBool("ccw");
  mCastShadows = findSFBool("castShadows");
  mIsPickable = findSFBool("isPickable");

  mDownloader = NULL;
}

WbColladaShape::WbColladaShape(WbTokenizer *tokenizer) : WbBaseNode("ColladaShape", tokenizer) {
  init();
}

WbColladaShape::WbColladaShape(const WbColladaShape &other) : WbBaseNode(other) {
  init();
}

WbColladaShape::WbColladaShape(const WbNode &other) : WbBaseNode(other) {
  init();
}

WbColladaShape::~WbColladaShape() {
  if (areWrenObjectsInitialized())
    deleteWrenObjects();
}

void WbColladaShape::downloadAssets() {
  if (mUrl->size() == 0)
    return;

  const QString completeUrl = WbUrl::computePath(this, "url", mUrl->item(0), false);
  if (!WbUrl::isWeb(completeUrl) || WbNetwork::instance()->isCached(completeUrl))
    return;

  if (mDownloader != NULL && mDownloader->hasFinished())
    delete mDownloader;

  mDownloader = new WbDownloader(this);
  if (!WbWorld::instance()->isLoading())  // URL changed from the scene tree or supervisor
    connect(mDownloader, &WbDownloader::complete, this, &WbColladaShape::downloadUpdate);

  mDownloader->download(QUrl(completeUrl));
}

void WbColladaShape::downloadUpdate() {
  updateUrl();
  WbWorld::instance()->viewpoint()->emit refreshRequired();
}

void WbColladaShape::preFinalize() {
  WbBaseNode::preFinalize();
}

void WbColladaShape::postFinalize() {
  WbBaseNode::postFinalize();

  connect(mUrl, &WbMFString::changed, this, &WbColladaShape::updateUrl);
  connect(mCcw, &WbSFBool::changed, this, &WbColladaShape::updateCcw);
  connect(mCastShadows, &WbSFBool::changed, this, &WbColladaShape::updateCastShadows);
  connect(mIsPickable, &WbSFBool::changed, this, &WbColladaShape::updateIsPickable);

  connect(WbWrenRenderingContext::instance(), &WbWrenRenderingContext::backgroundColorChanged, this,
          &WbColladaShape::createWrenObjects);

  updateUrl();  // TODO: needed here? does the download take care of it every time?
  updateCcw();
  updateCastShadows();
  updateIsPickable();

  // apply segmentation color
  const WbSolid *solid = WbNodeUtilities::findUpperSolid(this);
  WbRgb color(0.0, 0.0, 0.0);
  while (solid) {
    if (solid->recognitionColorSize() > 0) {
      color = solid->recognitionColor(0);
      break;
    }
    solid = WbNodeUtilities::findUpperSolid(solid);
  }
  setSegmentationColor(color);
}

void WbColladaShape::updateUrl() {
  // we want to replace the windows backslash path separators (if any) with cross-platform forward slashes
  const int n = mUrl->size();
  for (int i = 0; i < n; i++) {
    QString item = mUrl->item(i);
    mUrl->blockSignals(true);
    mUrl->setItem(i, item.replace("\\", "/"));
    mUrl->blockSignals(false);
  }

  if (n > 0) {
    const QString completeUrl = WbUrl::computePath(this, "url", mUrl->item(0), false);
    if (WbUrl::isWeb(completeUrl)) {
      if (mDownloader && !mDownloader->error().isEmpty()) {
        warn(mDownloader->error());  // failure downloading or file does not exist (404)
        deleteWrenObjects();
        delete mDownloader;
        mDownloader = NULL;
        return;
      }

      if (!WbNetwork::instance()->isCached(completeUrl)) {
        if (mDownloader == NULL)
          downloadAssets();  // url was changed from the scene tree or supervisor
        return;
      }
    }

    updateShape();
  }
}

void WbColladaShape::updateShape() {  // TODO: needed?
  createWrenObjects();
}

void WbColladaShape::updateCcw() {
  for (WrRenderable *renderable : mWrenRenderables)
    wr_renderable_invert_front_face(renderable, !mCcw->value());
}

void WbColladaShape::updateCastShadows() {
  for (WrRenderable *renderable : mWrenRenderables)
    wr_renderable_set_cast_shadows(renderable, mCastShadows->value());
}

void WbColladaShape::updateIsPickable() {
  for (WrRenderable *renderable : mWrenRenderables)
    WbWrenPicker::setPickable(renderable, uniqueId(), mIsPickable->value());
}

void WbColladaShape::setSegmentationColor(const WbRgb &color) {
  const float segmentationColor[3] = {(float)color.red(), (float)color.green(), (float)color.blue()};
  for (WrMaterial *segmentationMaterial : mWrenSegmentationMaterials)
    wr_phong_material_set_linear_diffuse(segmentationMaterial, segmentationColor);
}

void WbColladaShape::createWrenObjects() {
  if (mUrl->size() == 0)
    return;

  WbBaseNode::createWrenObjects();

  deleteWrenObjects();

  Assimp::Importer importer;
  importer.SetPropertyInteger(AI_CONFIG_PP_RVC_FLAGS, aiComponent_CAMERAS | aiComponent_LIGHTS | aiComponent_BONEWEIGHTS |
                                                        aiComponent_ANIMATIONS | aiComponent_TEXTURES | aiComponent_COLORS);

  unsigned int flags = aiProcess_ValidateDataStructure | aiProcess_Triangulate | aiProcess_GenSmoothNormals |
                       aiProcess_JoinIdenticalVertices | aiProcess_OptimizeGraph | aiProcess_RemoveComponent |
                       aiProcess_FlipUVs;

  const aiScene *scene;
  const QString completeUrl = WbUrl::computePath(this, "url", mUrl->item(0), false);
  if (!completeUrl.toLower().endsWith(".dae")) {
    warn(tr("Invalid url '%1'. ColladaShape node expects file in Collada ('.dae') format.").arg(completeUrl));
    return;
  }

  if (WbUrl::isWeb(completeUrl)) {
    if (!WbNetwork::instance()->isCached(completeUrl)) {
      if (mDownloader == NULL)  // never attempted to download it, try now
        downloadAssets();
      return;
    }

    QFile file(WbNetwork::instance()->get(completeUrl));
    if (!file.open(QIODevice::ReadOnly)) {
      warn(tr("Collada file could not be read: '%1'").arg(completeUrl));
      return;
    }
    const QByteArray data = file.readAll();
    scene = importer.ReadFileFromMemory(data.constData(), data.size(), flags, ".dae");
  } else
    scene = importer.ReadFile(completeUrl.toStdString().c_str(), flags);

  if (!scene) {
    warn(tr("Invalid data, please verify collada file: %1").arg(importer.GetErrorString()));
    return;
  }

  // Assimp fix for up_axis
  // Adapted from https://github.com/assimp/assimp/issues/849
  int upAxis = 1, upAxisSign = 1, frontAxis = 2, frontAxisSign = 1, coordAxis = 0, coordAxisSign = 1;
  double unitScaleFactor = 1.0;
  if (scene->mMetaData) {
    scene->mMetaData->Get<int>("UpAxis", upAxis);
    scene->mMetaData->Get<int>("UpAxisSign", upAxisSign);
    scene->mMetaData->Get<int>("FrontAxis", frontAxis);
    scene->mMetaData->Get<int>("FrontAxisSign", frontAxisSign);
    scene->mMetaData->Get<int>("CoordAxis", coordAxis);
    scene->mMetaData->Get<int>("CoordAxisSign", coordAxisSign);
    scene->mMetaData->Get<double>("UnitScaleFactor", unitScaleFactor);
  }

  aiVector3D upVec, forwardVec, rightVec;
  upVec[upAxis] = upAxisSign * (float)unitScaleFactor;
  forwardVec[frontAxis] = frontAxisSign * (float)unitScaleFactor;
  rightVec[coordAxis] = coordAxisSign * (float)unitScaleFactor;

  aiMatrix4x4 mat(rightVec.x, rightVec.y, rightVec.z, 0.0f, upVec.x, upVec.y, upVec.z, 0.0f, forwardVec.x, forwardVec.y,
                  forwardVec.z, 0.0f, 0.0f, 0.0f, 0.0f, 1.0f);
  scene->mRootNode->mTransformation = mat;

  std::list<aiNode *> queue;
  queue.push_back(scene->mRootNode);

  aiNode *node;
  while (!queue.empty()) {
    node = queue.front();
    queue.pop_front();

    printf("node %s has %d meshes and %d children \n", node->mName.C_Str(), node->mNumMeshes, node->mNumChildren);

    for (unsigned int i = 0; i < node->mNumMeshes; ++i) {
      const aiMesh *mesh = scene->mMeshes[node->mMeshes[i]];
      printf(" > mesh %s (%p) has %d vertices and material index %d\n", mesh->mName.data, mesh, mesh->mNumVertices,
             mesh->mMaterialIndex);

      // compute absolute transform of this node from all the parents
      const int vertices = mesh->mNumVertices;
      const int faces = mesh->mNumFaces;
      if (vertices < 3)  // silently ignore meshes with less than 3 vertices as they are invalid
        continue;

      if (vertices > 100000)
        warn(tr("mesh '%1' has more than 100'000 vertices, it is recommended to reduce the number of vertices.")
               .arg(mesh->mName.C_Str()));

      aiMatrix4x4 transform;
      aiNode *current = node;
      while (current != NULL) {
        transform *= current->mTransformation;
        current = current->mParent;
      }

      // create the arrays
      int currentCoordIndex = 0;
      float *const coordData = new float[3 * vertices];
      int currentNormalIndex = 0;
      float *const normalData = new float[3 * vertices];
      int currentTexCoordIndex = 0;
      float *const texCoordData = new float[2 * vertices];
      int currentIndexIndex = 0;
      unsigned int *const indexData = new unsigned int[3 * faces];

      for (size_t j = 0; j < mesh->mNumVertices; ++j) {
        // extract the coordinate
        const aiVector3D vertice = transform * mesh->mVertices[j];
        coordData[currentCoordIndex++] = vertice[0];
        coordData[currentCoordIndex++] = vertice[1];
        coordData[currentCoordIndex++] = vertice[2];
        // extract the normal
        const aiVector3D normal = transform * mesh->mNormals[j];
        normalData[currentNormalIndex++] = normal[0];
        normalData[currentNormalIndex++] = normal[1];
        normalData[currentNormalIndex++] = normal[2];
        // extract the texture coordinate
        if (mesh->HasTextureCoords(0)) {
          texCoordData[currentTexCoordIndex++] = mesh->mTextureCoords[0][j].x;
          texCoordData[currentTexCoordIndex++] = mesh->mTextureCoords[0][j].y;
        } else {
          texCoordData[currentTexCoordIndex++] = 0.5;
          texCoordData[currentTexCoordIndex++] = 0.5;
        }
      }

      // create the index array
      for (size_t j = 0; j < mesh->mNumFaces; ++j) {
        const aiFace face = mesh->mFaces[j];
        if (face.mNumIndices < 3)  // we want to skip lines
          continue;
        assert(face.mNumIndices == 3);
        indexData[currentIndexIndex++] = face.mIndices[0];
        indexData[currentIndexIndex++] = face.mIndices[1];
        indexData[currentIndexIndex++] = face.mIndices[2];
      }

      // TODO: vertex_count and index_count always equal? (vertices)
      // TODO: handle outline

      WrStaticMesh *staticMesh =
        wr_static_mesh_new(vertices, currentIndexIndex, coordData, normalData, texCoordData, texCoordData, indexData, false);

      mWrenMeshes.push_back(staticMesh);

      delete[] coordData;
      delete[] normalData;
      delete[] texCoordData;
      delete[] indexData;

      // retrieve material properties
      const aiMaterial *material = scene->mMaterials[mesh->mMaterialIndex];

      // determine how image textures will be searched for
      QString completeUrl = WbUrl::computePath(this, "url", mUrl->item(0), false);
      completeUrl = completeUrl.replace("\\", "/");
      QString fileRoot = completeUrl.left(completeUrl.lastIndexOf("/"));  // do not include the final forward slash

      // init from assimp material
      WbPbrAppearance *pbrAppearance = new WbPbrAppearance(material, fileRoot);
      pbrAppearance->preFinalize();
      pbrAppearance->postFinalize();
      connect(pbrAppearance, &WbPbrAppearance::changed, this, &WbColladaShape::updateAppearance);

      WrMaterial *wrenMaterial = wr_pbr_material_new();
      pbrAppearance->modifyWrenMaterial(wrenMaterial);

      mPbrAppearances.push_back(pbrAppearance);
      mWrenMaterials.push_back(wrenMaterial);
    }
  }

  printf("create WREN objects, size %lld\n", mWrenMeshes.size());
  for (int i = 0; i < mWrenMeshes.size(); ++i) {
    WrRenderable *renderable = wr_renderable_new();
    wr_renderable_set_material(renderable, mWrenMaterials[i], NULL);
    wr_renderable_set_mesh(renderable, WR_MESH(mWrenMeshes[i]));
    wr_renderable_set_receive_shadows(renderable, true);
    wr_renderable_set_visibility_flags(renderable, WbWrenRenderingContext::VM_REGULAR);

    // set material for range finder camera rendering
    WrMaterial *depthMaterial = wr_phong_material_new();
    wr_material_set_default_program(depthMaterial, WbWrenShaders::encodeDepthShader());
    wr_renderable_set_material(renderable, depthMaterial, "encodeDepth");

    // set material for segmentation camera rendering
    WrMaterial *segmentationMaterial = wr_phong_material_new();
    wr_material_set_default_program(segmentationMaterial, WbWrenShaders::segmentationShader());
    wr_renderable_set_material(renderable, segmentationMaterial, "segmentation");

    WrTransform *transform = wr_transform_new();
    wr_transform_attach_child(wrenNode(), WR_NODE(transform));
    setWrenNode(transform);
    wr_transform_attach_child(transform, WR_NODE(renderable));
    wr_node_set_visible(WR_NODE(transform), true);

    mWrenRenderables.push_back(renderable);
    mWrenTransforms.push_back(transform);
    mWrenEncodeDepthMaterials.push_back(depthMaterial);
    mWrenSegmentationMaterials.push_back(segmentationMaterial);
  }
}
void WbColladaShape::updateAppearance() {
  assert(mPbrAppearances.size() == mWrenMaterials.size());

  for (int i = 0; i < mPbrAppearances.size(); ++i)
    mPbrAppearances[i]->modifyWrenMaterial(mWrenMaterials[i]);
}

void WbColladaShape::deleteWrenObjects() {
  printf("> delete wren meshes\n");
  for (WrRenderable *renderable : mWrenRenderables) {
    wr_material_delete(wr_renderable_get_material(renderable, "picking"));
    wr_node_delete(WR_NODE(renderable));
  }

  for (WrStaticMesh *mesh : mWrenMeshes)
    wr_static_mesh_delete(mesh);

  for (WrMaterial *material : mWrenMaterials)
    wr_material_delete(material);

  for (WrMaterial *depthMaterial : mWrenEncodeDepthMaterials)
    wr_material_delete(depthMaterial);

  for (WrMaterial *segmentationMaterial : mWrenSegmentationMaterials)
    wr_material_delete(segmentationMaterial);

  for (WbPbrAppearance *appearance : mPbrAppearances)
    delete appearance;

  for (WrTransform *transform : mWrenTransforms)
    wr_node_delete(WR_NODE(transform));

  mWrenRenderables.clear();
  mWrenMeshes.clear();
  mWrenMaterials.clear();
  mWrenEncodeDepthMaterials.clear();
  mWrenSegmentationMaterials.clear();
  mWrenTransforms.clear();

  mPbrAppearances.clear();
}

QString WbColladaShape::colladaPath() const {
  return WbUrl::computePath(this, "url", mUrl, false);
}