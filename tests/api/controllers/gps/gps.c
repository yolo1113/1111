#include <webots/gps.h>
#include <webots/robot.h>

#include "../../../lib/ts_assertion.h"
#include "../../../lib/ts_utils.h"

void check_position(WbDeviceTag gps, double expected_position[], char *end_msg) {
  const double *position = wb_gps_get_values(gps);
  char axisNames[] = "XYZ";
  for (int i = 0; i < 3; i++)
    ts_assert_double_in_delta(position[i], expected_position[i], 0.000001,
                              "The %c value measured by the GPS should be %g and not %f %s.", axisNames[i],
                              expected_position[i], position[i], end_msg);
}

int main(int argc, char **argv) {
  ts_setup(argv[0]);
  const int time_step = wb_robot_get_basic_time_step();
  WbDeviceTag gps = wb_robot_get_device("gps");

  check_position(gps, (double *){NAN, NAN, NAN}, "before the device is enabled");
  wb_gps_enable(gps, time_step);

  check_position(gps, (double *){NAN, NAN, NAN}, "before a wb_robot_step is performed");

  ts_assert_int_equal(wb_gps_get_coordinate_system(gps), WB_GPS_LOCAL_COORDINATE, "Wrong coordinate system returned");

  for (int j = 1; j <= 10; j++) {
    wb_robot_step(time_step);
    char s[64];
    snprint(s, sizeof(s), "after %d wb_robot_step(s)", i);
    check_position(gps, (double *){0.19996, 0.05, -0.35}, s);
  }

  ts_send_success();
  return EXIT_SUCCESS;
}
