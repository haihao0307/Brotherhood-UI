import unittest

import brotherhood_ui_launcher as launcher


class LauncherActionPlanTests(unittest.TestCase):
    def test_auto_uses_serve_and_watch_then_opens_local_board(self) -> None:
        commands, open_local_board = launcher.get_launcher_action_plan("auto")

        self.assertEqual(commands, ["serve", "watch"])
        self.assertTrue(open_local_board)

    def test_open_skips_runtime_command_and_opens_local_board(self) -> None:
        commands, open_local_board = launcher.get_launcher_action_plan("open")

        self.assertEqual(commands, [])
        self.assertTrue(open_local_board)

    def test_doctor_stays_runtime_only(self) -> None:
        commands, open_local_board = launcher.get_launcher_action_plan("doctor")

        self.assertEqual(commands, ["doctor"])
        self.assertFalse(open_local_board)


if __name__ == "__main__":
    unittest.main()
