// Copyright 1996-2021 Cyberbotics Ltd.
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

#ifndef WB_ALTIMETER_HPP
#define WB_ALTIMETER_HPP

#include "WbSolidDevice.hpp"

class WbSFString;
class WbSFDouble;
class WbSensor;
class WbUTMConverter;

class WbAltimeter : public WbSolidDevice {
    Q_OBJECT

public:
    // constructors and destructor
    explicit WbAltimeter(WbTokenizer *tokenizer = NULL);
    WbAltimeter(const WbAltimeter &other);
    explicit WbAltimeter(const WbNode &other);
    virtual ~WbGps();

    // reimplemented public functions
    int nodeType() const override { return WB_NODE_ALTIMETER; }
    enum CoordinateSystem { Local = 0, WGS84 }; //Might only need geoid to be defined
    void preFinalize() override;
}

#endif