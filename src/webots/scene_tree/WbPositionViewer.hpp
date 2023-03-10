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

#ifndef WB_POSITION_VIEWER_HPP
#define WB_POSITION_VIEWER_HPP

//
// Description: viewer showing information about Solid's physics
//

#include <QtWidgets/QWidget>

class QVBoxLayout;
class QComboBox;
class QLabel;
class WbPose;

class WbPositionViewer : public QWidget {
  Q_OBJECT

public:
  explicit WbPositionViewer(QWidget *parent = NULL);
  virtual ~WbPositionViewer();

  void show(WbPose *transform);

  void stopUpdating();
  void setSelected(bool selected);
  void triggerPhysicsUpdates();

public slots:
  void clean();
  void update();
  void requestUpdate();

private:
  void updateRelativeToComboBox();

  WbPose *mPose;
  bool mIsSelected;

  // relative to boxes
  QComboBox *mRelativeToComboBox;

  // Layouts
  QVBoxLayout *mTopLayout;

  // Labels
  QVector<QLabel *> mPositionLabels;
  QVector<QLabel *> mRotationLabels;

private slots:
  void updateRelativeTo(int index);
};

#endif
