/*
 * Copyright 1996-2021 Cyberbotics Ltd.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/*
 * Description:  This controller is used to move the six-wheeled (2 actuated) robot MiR100 in an industrial environment
 *               using the keyboard. The keys are the following:
 *
 *               vx         : ↑/↓
 *               ω          : Page Up/Page Down
 *               Reset      : Space bar
 */

#include <math.h>
#include <stdio.h>
#include <webots/keyboard.h>
#include <webots/motor.h>
#include <webots/robot.h>

#define TIME_STEP 32
#define WHEEL_RADIUS 0.075
#define SPEED_MAX 1.5
#define SPEED_MIN -0.3
#define ANGULAR_SPEED_MAX 0.3
#define ANGULAR_SPEED_MIN -0.3
#define SPEED_INCREMENT 0.15
#define DISTANCE_TO_CENTER 0.2226


int main() {
  wb_robot_init();

  WbDeviceTag motor_left_wheel = wb_robot_get_device("mir100_middle_left_wheel_joint");
  WbDeviceTag motor_right_wheel = wb_robot_get_device("mir100_middle_right_wheel_joint");

  // Wheels in velocity control, so position must be set to infinity.
  wb_motor_set_position(motor_left_wheel, INFINITY);
  wb_motor_set_position(motor_right_wheel, INFINITY);
  wb_motor_set_velocity(motor_left_wheel, 0.0);
  wb_motor_set_velocity(motor_right_wheel, 0.0);

  double target_speed = 0.0; // forwards speed [m].
  double target_omega = 0.0; // angular speed [rad/s].
  double new_target_speed;
  double new_target_omega;
  
  bool is_key_valid = 0;
  wb_keyboard_enable(TIME_STEP);
  int waiting_counter = 0;  // waiting counter (to avoid registering too much clicks when user long-clicks.

  printf("To move the Mir100 with your keyboard, click first inside the simulation window and press:\n \
    vx   : ↑/↓ \n \
    ω    : Page Up/Page Down \n \
    Reset: Space bar \n");

  while (wb_robot_step(TIME_STEP) != -1) {
    if (waiting_counter == 0) {
      int key = wb_keyboard_get_key();

      switch (key) {
        case WB_KEYBOARD_UP:
          is_key_valid = 1;
          new_target_speed = target_speed + SPEED_INCREMENT;
          target_speed = new_target_speed > SPEED_MAX ? SPEED_MAX : new_target_speed;
          break;

        case WB_KEYBOARD_DOWN:
          is_key_valid = 1;
          new_target_speed = target_speed - SPEED_INCREMENT;
          target_speed = new_target_speed < SPEED_MIN ? SPEED_MIN : new_target_speed;
          break;

        case WB_KEYBOARD_PAGEUP:
          is_key_valid = 1;
          new_target_omega = target_omega + SPEED_INCREMENT;
          target_omega = new_target_omega > ANGULAR_SPEED_MAX ? ANGULAR_SPEED_MAX : new_target_omega;
          break;

        case WB_KEYBOARD_PAGEDOWN:
          is_key_valid = 1;
          new_target_omega = target_omega - SPEED_INCREMENT;
          target_omega = new_target_omega < ANGULAR_SPEED_MIN ? ANGULAR_SPEED_MIN : new_target_omega;
          break;

        case ' ':
          is_key_valid = 1;
          target_speed = 0;
          target_omega = 0;
          break;

        default:
          is_key_valid = 0;
      }

      if (is_key_valid) {
        printf("vx:%.2f[m/s] ω:%.2f[rad/s]\n", target_speed, target_omega);
        waiting_counter = 10;

        // Computes the wheel motors speeds from vx and ω.
        wb_motor_set_velocity(motor_left_wheel, (target_speed + target_omega * DISTANCE_TO_CENTER) / WHEEL_RADIUS);
        wb_motor_set_velocity(motor_right_wheel, (target_speed - target_omega * DISTANCE_TO_CENTER) / WHEEL_RADIUS);
      }
    } else {
      waiting_counter -= 1;
    }
  }

  wb_robot_cleanup();
  return 0;
}
