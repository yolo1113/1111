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

#include "WbLog.hpp"
#include "WbQjsFile.hpp"
#include "WbStandardPaths.hpp"

#include <QtCore/QFile>
#include <QtCore/QTextStream>

QString WbQjsFile::readTextFile(const QString &filePath) {
  QFile file(filePath);

  if (!file.open(QIODevice::ReadOnly)) {
    WbLog::instance()->error(QString("JavaScript error: could not open file: %1.").arg(filePath), false, WbLog::PARSING);
    return "";
  }

  return file.readAll();
}

void WbQjsFile::writeTextFile(const QString &fileName, const QString &content) {
  QFile file(WbStandardPaths::webotsTmpPath() + fileName);
  if (!file.open(QIODevice::WriteOnly | QIODevice::Truncate | QIODevice::Text)) {
    WbLog::instance()->error(
      QString("JavaScript error: could not write file '%1' to temporary path.").arg(fileName).arg(__FUNCTION__), false,
      WbLog::PARSING);
    return;
  }

  QTextStream outputStream(&file);
  outputStream << content;
  file.close();
}

QString WbQjsFile::getPathWithoutFilename(const QString &filePath) {
  if (!filePath.contains("/")) {
    WbLog::instance()->error(QString("JavaScript error: '%1' is not a valid file path in %2.").arg(filePath).arg(__FUNCTION__),
                             false, WbLog::PARSING);
    return "";
  }

  return filePath.left(filePath.lastIndexOf("/") + 1);
}

QString WbQjsFile::getFilenameFromPath(const QString &filePath) {
  if (!filePath.contains("/")) {
    WbLog::instance()->error(QString("JavaScript error: '%1' is not a valid file path in %2.").arg(filePath).arg(__FUNCTION__),
                             false, WbLog::PARSING);
    return "";
  }

  return filePath.right(filePath.size() - filePath.lastIndexOf("/") - 1);
}
