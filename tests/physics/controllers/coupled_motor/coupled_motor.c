#include <stdio.h>
#include <webots/device.h>
#include <webots/motor.h>
#include <webots/position_sensor.h>
#include <webots/robot.h>
#include <webots/supervisor.h>

#include "../../../lib/ts_assertion.h"
#include "../../../lib/ts_utils.h"

#define TIME_STEP 16
#define NB_SENSORS 5
#define NB_MOTORS 5

int main(int argc, char **argv) {
  ts_setup(argv[0]);

  const char *test_type = argv[1];

  if (strcmp("coupling_test", test_type) == 0) {
    // Test: verify that motors are coupled correctly according to naming convention (indirect test by changing the parameters
    // and see how they propagate) names are: ["motor group a", "motor group a::subgroup b",
    // "motor group a::subgroup c", "motor group b::subgroup b"]
    WbDeviceTag motor_group_a = wb_robot_get_device("motor group a");
    WbDeviceTag motor_group_a_subgroup_b = wb_robot_get_device("motor group a::subgroup b");
    WbDeviceTag motor_group_a_subgroup_c = wb_robot_get_device("motor group a::subgroup c");
    WbDeviceTag motor_group_b_subgroup_b = wb_robot_get_device("motor group b::subgroup b");

    wb_motor_set_acceleration(motor_group_a, 20);  // should affect only itself, right name but missing delimiter
    wb_robot_step(TIME_STEP);

    ts_assert_double_equal(wb_motor_get_acceleration(motor_group_a), 20,
                           "Motor 'motor group a' should have acceleration 20 but does not.");
    ts_assert_double_equal(wb_motor_get_acceleration(motor_group_a_subgroup_b), 10,
                           "Motor 'motor group a::subgroup b' should have acceleration 10 but does not.");
    ts_assert_double_equal(wb_motor_get_acceleration(motor_group_a_subgroup_c), 10,
                           "Motor 'motor group a::subgroup c' should have acceleration 10 but does not.");
    ts_assert_double_equal(wb_motor_get_acceleration(motor_group_b_subgroup_b), 10,
                           "Motor 'motor group b::subgroup b' should have acceleration 10 but does not.");

    wb_motor_set_acceleration(motor_group_a_subgroup_c, 30);  // should affect only the second and third
    wb_robot_step(TIME_STEP);

    ts_assert_double_equal(wb_motor_get_acceleration(motor_group_a), 20,
                           "Motor 'motor group a' should have acceleration 20 but does not.");
    ts_assert_double_equal(wb_motor_get_acceleration(motor_group_a_subgroup_b), 30,
                           "Motor 'motor group a::subgroup b' should have acceleration 30 but does not.");
    ts_assert_double_equal(wb_motor_get_acceleration(motor_group_a_subgroup_c), 30,
                           "Motor 'motor group a::subgroup c' should have acceleration 30 but does not.");
    ts_assert_double_equal(wb_motor_get_acceleration(motor_group_b_subgroup_b), 10,
                           "Motor 'motor group b::subgroup b' should have acceleration 10 but does not.");

    wb_motor_set_acceleration(motor_group_b_subgroup_b, 40);  // should affect only itself
    wb_robot_step(TIME_STEP);

    ts_assert_double_equal(wb_motor_get_acceleration(motor_group_a), 20,
                           "Motor 'motor group a' should have acceleration 20 but does not.");
    ts_assert_double_equal(wb_motor_get_acceleration(motor_group_a_subgroup_b), 30,
                           "Motor 'motor group a::subgroup b' should have acceleration 30 but does not.");
    ts_assert_double_equal(wb_motor_get_acceleration(motor_group_a_subgroup_c), 30,
                           "Motor 'motor group a::subgroup c' should have acceleration 30 but does not.");
    ts_assert_double_equal(wb_motor_get_acceleration(motor_group_b_subgroup_b), 40,
                           "Motor 'motor group b::subgroup b' should have acceleration 40 but does not.");
  }

  if (strcmp("load_test", test_type) == 0) {
    // Test: acceleration parameter load. Note: all motors have the same multiplier.
    // acceleration on file [5, 10, 20] -> [5, 5, 5] after loading
    // same multiplier, different limits => the value of the first motor is enforced for all
    for (int i = 0; i < 3; ++i) {
      WbDeviceTag motor = wb_robot_get_device_by_index(i);
      ts_assert_double_equal(wb_motor_get_acceleration(motor), 5, "Motor A: 'acceleration' should be 5 but isn't.");
    }
    // acceleration on file [-1, 10, 20] -> [-1, -1, -1] after loading
    // same multiplier, the first is unlimited => all must be unlimited
    for (int i = 3; i < 6; ++i) {
      WbDeviceTag motor = wb_robot_get_device_by_index(i);
      ts_assert_double_equal(wb_motor_get_acceleration(motor), -1, "Motor B: 'acceleration' should be -1 but isn't.");
    }
    // Test loading velocity parameter. All motors have the same multiplier.
    // maxVelocity on file [5, 10, 20] -> [5, 5, 5] after loading
    // same multiplier, different limits => the value of the first motor is enforced for all
    for (int i = 6; i < 9; ++i) {
      WbDeviceTag motor = wb_robot_get_device_by_index(i);
      ts_assert_double_equal(wb_motor_get_velocity(motor), 5, "Motor C: 'maxVelocity' should be 5 but isn't.");
    }
    // Test loading minPosition and maxPosition parameters. All motors have the same multiplier.
    // minPosition on file [0, -10, -20] -> [0, 0, 0] after loading
    // maxPosition on file [0, 20, 40] -> [0, 0, 0] after loading
    // same multiplier, the first is unlimited => all must be unlimited
    for (int i = 9; i < 12; ++i) {
      WbDeviceTag motor = wb_robot_get_device_by_index(i);
      ts_assert_double_equal(wb_motor_get_min_position(motor), 0, "Motor D: 'minPosition' should be 0 but isn't.");
      ts_assert_double_equal(wb_motor_get_max_position(motor), 0, "Motor D: 'maxPosition' should be 0 but isn't.");
    }
    // minPosition on file [-5, -10, 0] -> [-5, -5, -5] after loading
    // maxPosition on file [10, 20, 0] -> [10, 10, 10] after loading
    // same multiplier, different limits => the value of the first motor is enforced for all
    for (int i = 12; i < 15; ++i) {
      WbDeviceTag motor = wb_robot_get_device_by_index(i);
      ts_assert_double_equal(wb_motor_get_min_position(motor), -5, "Motor E: 'minPosition' should be -5 but isn't.");
      ts_assert_double_equal(wb_motor_get_max_position(motor), 10, "Motor E: 'maxPosition' should be 10 but isn't.");
    }
    // Test multiplier.
    // multipliers on file [2, 0.5, 4] (which is [motor G1, motor G2, motor G3])
    // minPosition on file [-2, -2, -2] -> [-2, -0.5, -4] after loading
    // maxPosition on file [4, 4, 4] -> [4, 1, 8] after loading
    // maxVelocity on file [10, 10, 10] -> [10, 2.5, 20] after loading
    // maxAccel. on file   [10, 10, 10] -> [10, 2.5, 20] after loading
    WbDeviceTag motor = wb_robot_get_device_by_index(15);
    ts_assert_double_equal(wb_motor_get_min_position(motor), -2, "Motor F: 'minPosition' should be -2 but isn't.");
    ts_assert_double_equal(wb_motor_get_max_position(motor), 4, "Motor F: 'maxPosition' should be 4 but isn't.");
    ts_assert_double_equal(wb_motor_get_max_velocity(motor), 10, "Motor F: 'maxVelocity' should be 10 but isn't.");
    ts_assert_double_equal(wb_motor_get_acceleration(motor), 10, "Motor F: 'acceleration' should be 10 but isn't.");
    motor = wb_robot_get_device_by_index(16);
    ts_assert_double_equal(wb_motor_get_min_position(motor), -0.5, "Motor F: 'minPosition' should be -0.5 but isn't.");
    ts_assert_double_equal(wb_motor_get_max_position(motor), 1, "Motor F: 'maxPosition' should be 1 but isn't.");
    ts_assert_double_equal(wb_motor_get_max_velocity(motor), 2.5, "Motor F: 'maxVelocity' should be 2.5 but isn't.");
    ts_assert_double_equal(wb_motor_get_acceleration(motor), 2.5, "Motor F: 'acceleration' should be 2.5 but isn't.");
    motor = wb_robot_get_device_by_index(17);
    ts_assert_double_equal(wb_motor_get_min_position(motor), -4, "Motor F: 'minPosition' should be -4 but isn't.");
    ts_assert_double_equal(wb_motor_get_max_position(motor), 8, "Motor F: 'maxPosition' should be 8 but isn't.");
    ts_assert_double_equal(wb_motor_get_max_velocity(motor), 20, "Motor F: 'maxVelocity' should be 20 but isn't.");
    ts_assert_double_equal(wb_motor_get_acceleration(motor), 20, "Motor F: 'acceleration' should be 20 but isn't.");
    // multipliers on file [2, -0.5, -4] (which is [motor H1, motor H2, motor H3])
    // minPosition on file [-2, -2, -2] -> [-2, -1, -8] after loading. Note: [4, -8] and [0.5, -1] have swapped position
    // maxPosition on file [4, 4, 4] -> [4, 0.5, 4] after loading. Note: [4, -8] and [0.5, -1] have swapped position
    // maxVelocity on file [10, 10, 10] -> [10, 2.5, 20] after loading
    // maxAccel. on file   [10, 10, 10] -> [10, 2.5, 20] after loading
    motor = wb_robot_get_device_by_index(18);
    ts_assert_double_equal(wb_motor_get_min_position(motor), -2, "Motor G: 'minPosition' should be -2 but isn't.");
    ts_assert_double_equal(wb_motor_get_max_position(motor), 4, "Motor G: 'maxPosition' should be 4 but isn't.");
    ts_assert_double_equal(wb_motor_get_max_velocity(motor), 10, "Motor G: 'maxVelocity' should be 10 but isn't.");
    ts_assert_double_equal(wb_motor_get_acceleration(motor), 10, "Motor G: 'acceleration' should be 10 but isn't.");
    motor = wb_robot_get_device_by_index(19);
    ts_assert_double_equal(wb_motor_get_min_position(motor), -1, "Motor G: 'minPosition' should be -1 but isn't.");
    ts_assert_double_equal(wb_motor_get_max_position(motor), 0.5, "Motor G: 'maxPosition' should be 0.5 but isn't.");
    ts_assert_double_equal(wb_motor_get_max_velocity(motor), 2.5, "Motor G: 'maxVelocity' should be 2.5 but isn't.");
    ts_assert_double_equal(wb_motor_get_acceleration(motor), 2.5, "Motor G: 'acceleration' should be 2.5 but isn't.");
    motor = wb_robot_get_device_by_index(20);
    ts_assert_double_equal(wb_motor_get_min_position(motor), -8, "Motor G: 'minPosition' should be -8 but isn't.");
    ts_assert_double_equal(wb_motor_get_max_position(motor), 4, "Motor G: 'maxPosition' should be 4 but isn't.");
    ts_assert_double_equal(wb_motor_get_max_velocity(motor), 20, "Motor G: 'maxVelocity' should be 20 but isn't.");
    ts_assert_double_equal(wb_motor_get_acceleration(motor), 20, "Motor G: 'acceleration' should be 20 but isn't.");
  }

  if (strcmp("physics_test", test_type) == 0) {
    WbDeviceTag sensors[NB_SENSORS];
    char sensor_name[8];

    for (int i = 0; i < NB_SENSORS; ++i) {
      snprintf(sensor_name, sizeof(sensor_name), "sensor%d", i + 1);
      sensors[i] = wb_robot_get_device(sensor_name);
      wb_position_sensor_enable(sensors[i], TIME_STEP);
    }

    WbDeviceTag motors[NB_MOTORS];
    for (int i = 0; i < NB_MOTORS; ++i)
      motors[i] = wb_robot_get_device_by_index(2 * i + 1);

    double positions[NB_SENSORS];
    double tolerance = 1e-10;
    int k = 0;

    // velocity control, only actuate motor[0]
    wb_motor_set_position(motors[0], INFINITY);
    wb_motor_set_velocity(motors[0], 0.4);

    while (wb_robot_step(TIME_STEP) != -1 && k < 250) {
      if (k == 50)
        wb_motor_set_velocity(motors[0], -0.4);
      if (k == 100)
        wb_motor_set_velocity(motors[0], 0.2);
      if (k == 150)
        wb_motor_set_velocity(motors[0], -0.2);
      if (k == 202)
        wb_motor_set_velocity(motors[0], 0);

      for (int i = 0; i < NB_SENSORS; ++i)
        positions[i] = wb_position_sensor_get_value(sensors[i]);

      ts_assert_double_in_delta(positions[1], positions[0] * 0.5, tolerance,
                                "Velocity control: wrong position[1] when controlling motor[0].");
      ts_assert_double_in_delta(positions[2], positions[0] * 4.0, tolerance,
                                "Velocity control: wrong position[2] when controlling motor[0].");
      ts_assert_double_in_delta(positions[3], positions[0] * -0.5, tolerance,
                                "Velocity control: wrong position[3] when controlling motor[0].");
      ts_assert_double_in_delta(positions[4], positions[0] * -4.0, tolerance,
                                "Velocity control: wrong position[4] when controlling motor[0].");
      k++;
    }

    // actuate instead motor[4]
    wb_motor_set_velocity(motors[4], 0.4);

    k = 0;
    while (wb_robot_step(TIME_STEP) != -1 && k < 250) {
      if (k == 50)
        wb_motor_set_velocity(motors[4], -0.4);
      if (k == 100)
        wb_motor_set_velocity(motors[4], 0.2);
      if (k == 150)
        wb_motor_set_velocity(motors[4], -0.2);
      if (k == 202)
        wb_motor_set_velocity(motors[4], 0);

      for (int i = 0; i < NB_SENSORS; ++i)
        positions[i] = wb_position_sensor_get_value(sensors[i]);

      ts_assert_double_in_delta(positions[0], positions[4] * -0.25, tolerance,
                                "Velocity control: wrong position[0] when controlling motor[4].");
      ts_assert_double_in_delta(positions[1], positions[4] * -0.125, tolerance,
                                "Velocity control: wrong position[1] when controlling motor[4].");
      ts_assert_double_in_delta(positions[2], positions[4] * -1, tolerance,
                                "Velocity control: wrong position[2] when controlling motor[4].");
      ts_assert_double_in_delta(positions[3], positions[4] * 0.125, tolerance,
                                "Velocity control: wrong position[3] when controlling motor[4].");
      k++;
    }

    // switch to position control, actuate motors[0]
    wb_motor_set_velocity(motors[0], 10);  // restore max velocity
    wb_motor_set_position(motors[0], 1.5708);

    k = 0;
    tolerance = 1e-7;
    while (wb_robot_step(TIME_STEP) != -1 && k < 301) {
      if (k == 101)
        wb_motor_set_position(motors[0], -0.7854);
      if (k == 201)
        wb_motor_set_position(motors[0], 0);

      for (int i = 0; i < NB_SENSORS; ++i)
        positions[i] = wb_position_sensor_get_value(sensors[i]);

      if (k > 0 && !(k % 100)) {
        ts_assert_double_in_delta(positions[1], positions[0] * 0.5, tolerance,
                                  "Position control: wrong position[1] when controlling motor[0].");
        ts_assert_double_in_delta(positions[2], positions[0] * 4.0, tolerance,
                                  "Position control: wrong position[2] when controlling motor[0].");
        ts_assert_double_in_delta(positions[3], positions[0] * -0.5, tolerance,
                                  "Position control: wrong position[3] when controlling motor[0].");
        ts_assert_double_in_delta(positions[4], positions[0] * -4.0, tolerance,
                                  "Position control: wrong position[4] when controlling motor[0].");
      }
      k++;
    }

    // actuate motors[4] instead
    wb_motor_set_position(motors[4], -1.5708);

    k = 0;
    while (wb_robot_step(TIME_STEP) != -1 && k < 301) {
      if (k == 101)
        wb_motor_set_position(motors[4], 0.7854);
      if (k == 201)
        wb_motor_set_position(motors[4], 0.0);

      for (int i = 0; i < NB_SENSORS; ++i)
        positions[i] = wb_position_sensor_get_value(sensors[i]);

      if (k > 0 && !(k % 100)) {
        ts_assert_double_in_delta(positions[0], positions[4] * -0.25, tolerance,
                                  "Position control: wrong position[0] when controlling motor[4].");
        ts_assert_double_in_delta(positions[1], positions[4] * -0.125, tolerance,
                                  "Position control: wrong position[1] when controlling motor[4].");
        ts_assert_double_in_delta(positions[2], positions[4] * -1, tolerance,
                                  "Position control: wrong position[2] when controlling motor[4].");
        ts_assert_double_in_delta(positions[3], positions[4] * 0.125, tolerance,
                                  "Position control: wrong position[3] when controlling motor[4].");
      }
      k++;
    }

    // switch to torque control
    WbNodeRef test_robot = wb_supervisor_node_get_from_def("PHYSICS_TEST");
    wb_supervisor_node_reset_physics(test_robot);
    // actuate motor[0]
    wb_motor_set_torque(motors[0], 0.002);

    k = 0;
    tolerance = 1e-6;
    while (wb_robot_step(TIME_STEP) != -1 && k < 250) {
      if (k == 50)
        wb_motor_set_torque(motors[0], -0.004);
      if (k == 100)
        wb_motor_set_torque(motors[0], 0.001);
      if (k == 150)
        wb_motor_set_torque(motors[0], -0.002);
      if (k == 200)
        wb_motor_set_torque(motors[0], 0);

      for (int i = 0; i < NB_SENSORS; ++i)
        positions[i] = wb_position_sensor_get_value(sensors[i]);

      ts_assert_double_in_delta(positions[1], positions[0] * 0.5, tolerance,
                                "Torque control: wrong position[1] when controlling motor[0].");
      ts_assert_double_in_delta(positions[2], positions[0] * 4.0, tolerance,
                                "Torque control: wrong position[2] when controlling motor[0].");
      ts_assert_double_in_delta(positions[3], positions[0] * -0.5, tolerance,
                                "Torque control: wrong position[3] when controlling motor[0].");
      ts_assert_double_in_delta(positions[4], positions[0] * -4.0, tolerance,
                                "Torque control: wrong position[4] when controlling motor[0].");

      k++;
    }

    wb_supervisor_node_reset_physics(test_robot);
    // actuate motor[4]
    wb_motor_set_torque(motors[4], 0.001);

    k = 0;
    tolerance = 1e-6;
    while (wb_robot_step(TIME_STEP) != -1 && k < 250) {
      if (k == 50)
        wb_motor_set_torque(motors[0], -0.002);
      if (k == 100)
        wb_motor_set_torque(motors[0], 0.0005);
      if (k == 150)
        wb_motor_set_torque(motors[0], -0.001);
      if (k == 200)
        wb_motor_set_torque(motors[0], 0);

      for (int i = 0; i < NB_SENSORS; ++i)
        positions[i] = wb_position_sensor_get_value(sensors[i]);

      ts_assert_double_in_delta(positions[0], positions[4] * -0.25, tolerance,
                                "Torque control: wrong position[0] when controlling motor[4].");
      ts_assert_double_in_delta(positions[1], positions[4] * -0.125, tolerance,
                                "Torque control: wrong position[1] when controlling motor[4].");
      ts_assert_double_in_delta(positions[2], positions[4] * -1, tolerance,
                                "Torque control: wrong position[2] when controlling motor[4].");
      ts_assert_double_in_delta(positions[3], positions[4] * 0.125, tolerance,
                                "Torque control: wrong position[3] when controlling motor[4].");

      k++;
    }
  }

  ts_send_success();
  return EXIT_SUCCESS;
}
