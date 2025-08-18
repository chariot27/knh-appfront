import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "devUnlock@v1";

export async function isDevUnlock(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(KEY);
    return v === "1" || v === "true";
  } catch {
    return false;
  }
}

export async function setDevUnlock(on: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, on ? "1" : "0");
  } catch {}
}

export async function clearDevUnlock(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {}
}
