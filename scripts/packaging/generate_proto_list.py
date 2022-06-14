#!/usr/bin/env python

# Copyright 1996-2022 Cyberbotics Ltd.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

"""Generate Webots proto-list.xml file"""

import os
import glob
import sys
import re
import xml.dom.minidom
import multiprocessing
from pathlib import Path
import xml.etree.ElementTree as ET

SKIPPED_PROTO = ['UsageProfile.proto']

# list of devices and regex to test if any of them is present in a non-Robot node
DEVICES = ['Brake', 'LinearMotor', 'PositionSensor', 'RotationalMotor', 'Skin', 'Accelerometer', 'Altimeter', 'Camera',
           'Compass', 'Compass', 'Display', 'DistanceSensor', 'Emitter', 'GPS', 'Gyro', 'InertialUnit', 'LED', 'Lidar',
           'LightSensor', 'Pen', 'Radar', 'RangeFinder', 'Receiver', 'Speaker', 'TouchSensor', 'Track']

regex_device = [rf'\s+{device}\s*' for device in DEVICES]
regex_device = "(" + "|".join(regex_device) + ")"


class ProtoInfo:
    def __init__(self, path, name):
        self.name = name
        self.path = path
        self.proto_type = None  # direct node type, ex: for RoadSegment is Road
        self.base_type = None   # lowest node type, ex: for RoadSegment is Solid
        self.license = None
        self.license_url = None
        self.description = ''
        self.documentation_url = None
        self.tags = []
        self.parameters = []
        # exclusive to slots
        self.slot_type = None
        self.needs_robot_ancestor = False

        # store file contents to avoid reading it multiple times
        with open(self.path, 'r') as file:
            self.contents = file.read()
            # remove IndexedFaceSet related fields since they significantly slow down the subsequent regex
            self.contents = re.sub('point\s+\[[^\]]+\]', '', self.contents)
            self.contents = re.sub('vector\s+\[[^\]]+\]', '', self.contents)
            self.contents = re.sub('coordIndex\s+\[[^\]]+\]', '', self.contents)
            self.contents = re.sub('normalIndex\s+\[[^\]]+\]', '', self.contents)

        self.parse_header()
        self.parse_parameters()
        self.parse_body()

    def parse_header(self):
        for line in self.contents.split('\n'):
            if not line.startswith('#'):
                break  # only parse header lines

            clean_line = line[1:].strip()
            if clean_line.startswith('VRML_SIM') or re.search('template language\s*:', clean_line):
                continue
            elif re.search('license\s*:', clean_line):
                self.license = re.sub('license\s*:', '', clean_line).strip()
            elif re.search('license url\s*:', clean_line):
                self.license_url = re.sub('license url\s*:', '', clean_line).strip()
            elif re.search('documentation url\s*:', clean_line):
                self.documentation_url = re.sub('documentation url\s*:', '', clean_line).strip()
            elif re.search('tags\s*:', clean_line):
                tags = re.sub('tags\s*:', '', clean_line).strip().split(',')
                self.tags = [tag.strip() for tag in tags]
            else:
                self.description += clean_line.strip() + '\\n'

    def parse_parameters(self):
        for match in re.findall('(?<=\s\s)((?:field|vrmlField)\s+[^\n\#]+)', self.contents):
            self.parameters.append(match.strip())

    def parse_body(self):
        # determine the proto_type of the PROTO (ex: for RoadSegment is Road)
        # regex: it searches for the beginning part of the PROTO body (i.e starting from ']{'), excluding both any existing
        # template statements (i.e., %< ... >%) along with any 'DEF SOMETHING'. What follows and up to the next '{' is the
        # proto_type
        child_node = re.search('(?:\]\s*)\{\s*(?:\%\<[\s\S]*?(?:\>\%\s*))?(?:DEF\s+[^\s]+)?\s+([a-zA-Z0-9\_\-\+]+)\s*\{',
                               self.contents)
        self.proto_type = child_node.groups()[-1]


def check_robot_ancestor_requirement(info):
    global regex_device
    if info.proto_type in ['Solid', 'Transform', 'Group']:
        # check if contains any device
        if re.search(regex_device, info.contents):
            info.needs_robot_ancestor = True


def generate_proto_list(current_tag=None, silent=False):
    # ensure WEBOTS_HOME is set
    if 'WEBOTS_HOME' in os.environ:
        WEBOTS_HOME = os.environ['WEBOTS_HOME']
    else:
        raise RuntimeError('Error, WEBOTS_HOME variable is not set.')

    # if no argument (branch/release/hash) is provided, assume it's a locally defined 'webots://'
    if current_tag:
        prefix = f'https://raw.githubusercontent.com/cyberbotics/webots/{current_tag}/'
    else:
        prefix = 'webots://'

    if not silent:
        print(f'# generating with prefix "{prefix}"')

    # find all PROTO assets
    assets = []
    assets.extend(Path(WEBOTS_HOME + '/projects').rglob('*.proto'))

    # do the initial parsing (header and body) for each proto, storing the result in a dictionary so as to be able to
    # access the different assets on a name basis (required for the second and third passes)
    protos = {}
    for asset in assets:
        if asset.name in SKIPPED_PROTO:
            continue

        info = ProtoInfo(str(asset), asset.stem)
        if info.name in protos:
            raise RuntimeError(f'PROTO names should be unique, but {info.name} is not.')
        else:
            protos[info.name] = info

    # determine base_type from proto_type by iterating over the dictionary until a base_node is reached
    base_nodes = [os.path.splitext(os.path.basename(x))[0] for x in glob.glob(f'{WEBOTS_HOME}/resources/nodes/*.wrl')]
    for key, info in protos.items():
        info.base_type = info.proto_type
        while info.base_type not in base_nodes:
            if info.base_type not in protos:  # the current proto depends on a sub-proto: iterate until a base node is reached
                raise RuntimeError(f'Error: "{info.base_type}" proto node does not exist. Either it was skipped or the regex '
                                   'that retrieves the proto_type is incorrect.')
            sub_proto = protos[info.base_type]
            info.base_type = sub_proto.proto_type

    # Solid, Transform and Group nodes might be a collection of devices, so determine if the PROTO needs a Robot ancestor
    pool = multiprocessing.Pool()
    _ = pool.map(check_robot_ancestor_requirement, protos.values())

    # iteratively determine the slot type, if applicable
    for key, info in protos.items():
        if info.base_type == "Slot":
            # iterate through lower level nodes until a valid slot type definition is found
            found = False
            current_proto = info
            while not found:
                # check if the node defines a type
                matches = re.findall('type\s+\"([a-zA-Z0-9\_\-\+\s]+)\"', current_proto.contents)
                if len(matches) > 0:
                    info.slot_type = matches[0]  # we are interested in the first Slot, if multiple exist
                    found = True
                else:
                    # if this proto depends on a sub-proto, the type might be defined there instead
                    if current_proto.proto_type in base_nodes:
                        if current_proto.proto_type == "Slot":  # if the base node is reached
                            info.slot_type = ''  # default value of the 'type' field in a Slot node (defined in wrl file)
                            found = True
                        else:
                            raise RuntimeError('Reached a non-Slot base node. This should not be possible.')
                    else:
                        if current_proto.proto_type in protos:
                            current_proto = protos[current_proto.proto_type]  # go one level deeper
                        else:
                            raise RuntimeError(f'Sub-proto "{current_proto.proto_type}" is not a known proto.')

    # generate xml of proto list
    root = ET.Element('proto-list')
    for key, info in protos.items():
        proto_element = ET.SubElement(root, 'proto')
        ET.SubElement(proto_element, 'name').text = info.name
        ET.SubElement(proto_element, 'base-type').text = info.base_type
        ET.SubElement(proto_element, 'url').text = info.path.replace(WEBOTS_HOME + '/', prefix)

        if info.license is not None:
            ET.SubElement(proto_element, 'license').text = info.license
        if info.license_url is not None:
            ET.SubElement(proto_element, 'license-url').text = info.license_url
        if info.documentation_url is not None:
            ET.SubElement(proto_element, 'documentation-url').text = info.documentation_url
        if info.description != '':
            ET.SubElement(proto_element, 'description').text = info.description
        if info.slot_type is not None:
            ET.SubElement(proto_element, 'slot-type').text = info.slot_type
        if info.tags:
            ET.SubElement(proto_element, 'tags').text = ','.join(info.tags)
        if info.parameters:
            ET.SubElement(proto_element, 'parameters').text = '\\n'.join(info.parameters)
        if info.needs_robot_ancestor:
            ET.SubElement(proto_element, 'needs-robot-ancestor').text = 'true'

    # beautify xml
    ET.ElementTree(root)
    xml_string = xml.dom.minidom.parseString(ET.tostring(root)).toprettyxml(encoding='utf-8')

    # save to file
    filename = f'{WEBOTS_HOME}/resources/proto-list.xml'
    if (os.path.exists(filename)):
        os.remove(filename)

    with open(filename, 'wb') as file:
        file.write(xml_string)


if __name__ == "__main__":
    if len(sys.argv) == 2:
        tag = sys.argv[1]
    else:
        tag = None

    generate_proto_list(tag)
