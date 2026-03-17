import { Platform } from "react-native";
import { App } from "./src/app/App";

if (Platform.OS !== "web") {
  require("expo-dev-client");
}

export default App;
