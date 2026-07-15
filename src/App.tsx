import { useStore } from "./state/store";
import { Home } from "./screens/Home";
import { Practice } from "./screens/Practice";
import { Rewards } from "./screens/Rewards";
import { Settings } from "./screens/Settings";
import { Calibrate } from "./screens/Calibrate";

export function App() {
  const screen = useStore((s) => s.screen);
  switch (screen) {
    case "practice":
      return <Practice />;
    case "rewards":
      return <Rewards />;
    case "settings":
      return <Settings />;
    case "calibrate":
      return <Calibrate />;
    default:
      return <Home />;
  }
}
