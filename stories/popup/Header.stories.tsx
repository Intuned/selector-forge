import type { StoryDefault } from "@ladle/react";
import { Header } from "@/entrypoints/popup/components/Header";
import type { AuthIdentity } from "@/lib/auth";
import { PopupFrame } from "../_popupFrame";

export default {
  title: "Popup/Header",
} satisfies StoryDefault;

const identity: AuthIdentity = {
  name: "Ada Lovelace",
  email: "ada@intuned.io",
  workspaceName: "Intuned",
};

export function SignedOut() {
  return (
    <PopupFrame>
      <Header
        authenticated={false}
        identity={null}
        usage={null}
        onSignOut={() => {}}
      />
    </PopupFrame>
  );
}

export function SignedIn() {
  return (
    <PopupFrame>
      <Header
        authenticated
        identity={identity}
        usage={{ used: 142, included: 500 }}
        onSignOut={() => {}}
      />
    </PopupFrame>
  );
}
