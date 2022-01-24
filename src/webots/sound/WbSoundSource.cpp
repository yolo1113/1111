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

#include "WbSoundSource.hpp"

#include "WbSoundClip.hpp"
#include "WbVector3.hpp"

#include <AL/al.h>

WbSoundSource::WbSoundSource() {
  /*   alGenSources(1, &mSource);
    alSourcei(mSource, AL_LOOPING, AL_FALSE); */
  return;
}

WbSoundSource::~WbSoundSource() {
  /*   alSourceStop(mSource);
    alDeleteSources(1, &mSource); */
  return;
}

bool WbSoundSource::isPlaying() const {
  /*   ALenum source_state;
    alGetSourcei(mSource, AL_SOURCE_STATE, &source_state);
    return (source_state == AL_PLAYING); */
  return;
}

bool WbSoundSource::isStopped() const {
  /*   ALenum source_state;
    alGetSourcei(mSource, AL_SOURCE_STATE, &source_state);
    return (source_state == AL_STOPPED); */
  return;
}

bool WbSoundSource::isPaused() const {
  /*   ALenum source_state;
    alGetSourcei(mSource, AL_SOURCE_STATE, &source_state);
    return (source_state == AL_PAUSED); */
  return;
}

void WbSoundSource::play() {
  /* alSourcePlay(mSource); */
  return;
}

void WbSoundSource::stop() {
  /*   alSourceStop(mSource); */
  return;
}

void WbSoundSource::pause() {
  /*   alSourcePause(mSource); */
  return;
}

void WbSoundSource::setLooping(bool loop) {
  /*   if (loop)
      alSourcei(mSource, AL_LOOPING, AL_TRUE);
    else
      alSourcei(mSource, AL_LOOPING, AL_FALSE); */
  return;
}

void WbSoundSource::setSoundClip(const WbSoundClip *clip) {
  /*   alSourcei(mSource, AL_BUFFER, clip->openALBuffer()); */
  return;
}

void WbSoundSource::setPitch(double pitch) {
  /*   alSourcef(mSource, AL_PITCH, pitch); */
  return;
}

void WbSoundSource::setGain(double gain) {
  /*   alSourcef(mSource, AL_GAIN, gain); */
  return;
}

void WbSoundSource::setPosition(const WbVector3 &pos) {
  /*   alSource3f(mSource, AL_POSITION, pos.x(), pos.y(), pos.z()); */
  return;
}

void WbSoundSource::setVelocity(const WbVector3 &v) {
  /*   alSource3f(mSource, AL_VELOCITY, v.x(), v.y(), v.z()); */
  return;
}

void WbSoundSource::setDirection(const WbVector3 &dir) {
  /*   alSource3f(mSource, AL_DIRECTION, dir.x(), dir.y(), dir.z()); */
  return;
}
