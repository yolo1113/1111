// Copyright 1996-2023 Cyberbotics Ltd.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

#define WB_ALLOW_MIXING_C_AND_CPP_API
#include <webots/supervisor.h>
#include <webots/Field.hpp>
#include <webots/Proto.hpp>

#include <stdio.h>
#include <map>

using namespace std;
using namespace webots;

static map<WbProtoRef, Proto *> protoMap;

Proto *Proto::findProto(WbProtoRef ref) {
  if (!ref)
    return NULL;

  map<WbProtoRef, Proto *>::iterator iter = protoMap.find(ref);
  if (iter != protoMap.end())
    return iter->second;

  Proto *field = new Proto(ref);
  protoMap.insert(pair<WbProtoRef, Proto *>(ref, field));
  return field;
}

void Proto::cleanup() {
  map<WbProtoRef, Proto *>::iterator iter;
  for (iter = protoMap.begin(); iter != protoMap.end(); ++iter)
    delete (*iter).second;

  protoMap.clear();
}

Proto::Proto(WbProtoRef ref) : protoRef(ref) {
}

string Proto::getTypeName() const {
  return wb_supervisor_proto_get_type_name(protoRef);
}

const bool Proto::isDerived() const {
  return wb_supervisor_proto_is_derived(protoRef);
}

Proto *Proto::getProtoParent() const {
  return findProto(wb_supervisor_proto_get_parent(protoRef));
}

Field *Proto::getParameter(const string &name) const {
  return Field::findField(wb_supervisor_proto_get_parameter(protoRef, name.c_str()));
}

Field *Proto::getParameterByIndex(const int index) const {
  return Field::findField(wb_supervisor_proto_get_parameter_by_index(protoRef, index));
}

const int Proto::getNumberOfParameters() const {
  return wb_supervisor_proto_get_number_of_parameters(protoRef);
}
