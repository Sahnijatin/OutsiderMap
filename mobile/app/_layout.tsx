import { useEffect } from "react";
import { View } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import { Fraunces_400Regular, Fraunces_600SemiBold } from "@expo-google-fonts/fraunces";
import { Geist_400Regular, Geist_500Medium } from "@expo-google-fonts/geist";
import { GeistMono_400Regular } from "@expo-google-fonts/geist-mono";
import { SessionProvider, useSession } from "@/lib/session";
import { ConvergenceField } from "@/ui/ConvergenceField";
import { colors } from "@/theme";

SplashScreen.preventAutoHideAsync();

function Splash() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.night, alignItems: "center", justifyContent: "center" }}>
      <ConvergenceField size={200} />
    </View>
  );
}

function RootNav() {
  const { loading, profileReady, session, onboarded } = useSession();
  const segments = useSegments();
  const router = useRouter();

  const ready = !loading && (!session || profileReady);

  useEffect(() => {
    if (!ready) return;
    const group = segments[0];
    const inAuth = group === "(auth)";
    const inOnboarding = group === "onboarding";

    if (!session && !inAuth) {
      router.replace("/(auth)/sign-in");
    } else if (session && !onboarded && !inOnboarding) {
      router.replace("/onboarding");
    } else if (session && onboarded && (inAuth || inOnboarding)) {
      router.replace("/(app)");
    }
  }, [ready, session, onboarded, segments, router]);

  if (!ready) return <Splash />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.night },
        animation: "fade",
      }}
    />
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Fraunces_400Regular,
    Fraunces_600SemiBold,
    Geist_400Regular,
    Geist_500Medium,
    GeistMono_400Regular,
  });

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync();
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <SessionProvider>
          <StatusBar style="light" />
          <RootNav />
        </SessionProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
