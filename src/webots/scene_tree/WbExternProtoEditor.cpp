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

#include "WbExternProtoEditor.hpp"
#include "WbActionManager.hpp"
#include "WbInsertExternProtoDialog.hpp"
#include "WbProtoManager.hpp"

#include <QtGui/QAction>
#include <QtWidgets/QGridLayout>
#include <QtWidgets/QLabel>
#include <QtWidgets/QPushButton>
#include <QtWidgets/QSpacerItem>

WbExternProtoEditor::WbExternProtoEditor(QWidget *parent) : WbValueEditor(parent) {
  connect(this, &WbExternProtoEditor::changed, WbActionManager::instance()->action(WbAction::SAVE_WORLD), &QAction::setEnabled);
  updateContents();
}

WbExternProtoEditor::~WbExternProtoEditor() {
}

void WbExternProtoEditor::updateContents() {
  // clear layout
  for (int i = mLayout->count() - 1; i >= 0; --i) {
    QWidget *const widget = mLayout->itemAt(i)->widget();
    if (widget) {
      layout()->removeWidget(widget);
      delete widget;
    }
  }

  // QLabel *const info = new QLabel(this);
  // info->setText("all PROTO that may be imported during the execution must be declared");
  // info->setWordWrap(true);
  // mLayout->addWidget(info, 0, 0, 1, 2, Qt::AlignCenter);
  // mLayout->setRowStretch(0, 1);
  // mLayout->setColumnStretch(0, 1);

  mInsertButton = new QPushButton("Insert new", this);
  mInsertButton->setToolTip(tr("Declare additional Ephemeral EXTERNPROTO."));
  mInsertButton->setMaximumWidth(125);
  mLayout->addWidget(mInsertButton, 0, 0, 1, 2, Qt::AlignCenter);
  mLayout->setRowStretch(0, 1);
  mLayout->setColumnStretch(0, 1);
  connect(mInsertButton, &QPushButton::pressed, this, &WbExternProtoEditor::insertExternProto);

  const QVector<WbExternProtoInfo *> &externProto = WbProtoManager::instance()->externProto();
  int row = 1;
  for (int i = 0; i < externProto.size(); ++i) {
    if (!externProto[i]->isEphemeral())
      continue;

    QLabel *const label = new QLabel(this);
    label->setTextInteractionFlags(Qt::TextSelectableByMouse);
    label->setStyleSheet("border: 1px solid black");
    // note: since the label text might be elided based on the available space, the tooltip MUST contain the full name of the
    // proto, this information is used by removeExternProto to know what to remove
    label->setToolTip(externProto[i]->name());
    label->setSizePolicy(QSizePolicy::Expanding, QSizePolicy::Preferred);
    setElidedText(label, externProto[i]->name());

    mLayout->addWidget(label, row, 0);
    mLayout->setRowStretch(row, 1);

    QIcon icon = QIcon();
    icon.addFile("enabledIcons:delete_button.png", QSize(), QIcon::Normal);
    QPushButton *const removeButton = new QPushButton();
    removeButton->setIcon(QIcon(icon));
    removeButton->setToolTip(tr("Remove."));
    removeButton->setMaximumWidth(40);
    connect(removeButton, &QPushButton::pressed, this, &WbExternProtoEditor::removeExternProto);
    mLayout->addWidget(removeButton, row, 1);

    row++;
  }

  QSpacerItem *spacer = new QSpacerItem(0, 1000, QSizePolicy::Expanding, QSizePolicy::Expanding);
  mLayout->addItem(spacer, row, 0, 1, 2);
}

void WbExternProtoEditor::insertExternProto() {
  WbInsertExternProtoDialog dialog(this);

  if (dialog.exec() == QDialog::Accepted) {
    updateContents();  // regenerate panel
    emit changed(true);
  }
}

void WbExternProtoEditor::removeExternProto() {
  const QPushButton *const caller = dynamic_cast<QPushButton *>(sender());
  const int index = caller ? mLayout->indexOf(caller) : -1;
  if (index != -1 && index > 1) {
    assert(mLayout->itemAt(index - 1)->widget());  // must be preceeded by a QLabel widget
    const QString proto = mLayout->itemAt(index - 1)->widget()->toolTip();
    WbProtoManager::instance()->removeExternProto(proto);
    updateContents();  // regenerate panel

    emit changed(true);
  }
}

void WbExternProtoEditor::setElidedText(QLabel *label, const QString &text) {
  QFontMetrics metrics(label->font());
  label->setText(metrics.elidedText(text, Qt::ElideRight, label->width() - 2));
}
