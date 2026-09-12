import { useState } from "react";
import AccountChoiceScreen from "./AccountChoiceScreen";
import ImportantMessageScreen from "./ImportantMessageScreen";
import SignInScreen from "./SignInScreen";
import RegisterScreen from "./RegisterScreen";

// Orchestrateur du funnel "premier lancement" : choix oui/non -> connexion
// ou inscription. Remplace l'ancien SignInScreen qui gérait lui-même son
// sous-mode "register" en interne — le switch est monté ici pour que "Pas
// encore de compte" (dans SignInScreen) revienne à l'écran de choix
// (AccountChoiceScreen), pas directement à l'inscription, cf. demande
// explicite du user.
//
// onSignedIn et onRegistered sont deux callbacks distincts (contrairement
// à avant, où RegisterScreen réutilisait onSignedIn) : seule une
// inscription réussie doit déclencher l'écran "Shalom [pseudo]!"
// (OnboardingScreen), une connexion réussie va directement à l'app
// normale, sans condition, cf. demande explicite du user.
export default function AuthFlow({ onSignedIn, onRegistered }) {
  const [step, setStep] = useState("choice"); // choice | signin | important-message | register

  if (step === "signin") {
    return <SignInScreen onSignedIn={onSignedIn} onBack={() => setStep("choice")} />;
  }
  // Écran "message important" (clavier hébreu PC/mobile) inséré entre le
  // choix "Non" et l'inscription elle-même — cf. demande explicite du
  // user.
  if (step === "important-message") {
    return <ImportantMessageScreen onContinue={() => setStep("register")} />;
  }
  if (step === "register") {
    return <RegisterScreen onRegistered={onRegistered} onBack={() => setStep("choice")} />;
  }
  return <AccountChoiceScreen onYes={() => setStep("signin")} onNo={() => setStep("important-message")} />;
}
