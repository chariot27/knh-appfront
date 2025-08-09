import { Redirect } from "expo-router";

export default function Index() {
  // no futuro: checar token e decidir pra onde ir
  return <Redirect href="/(tabs)/fixed/login" />;
}
