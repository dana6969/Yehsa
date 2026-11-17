// Plain-language no-account pledge. This is a repo data module, not a published page.

export const PLEDGE_TITLE = "Trust";

export const PLEDGE_LEAD = "Yehsa works on this phone. There is no account to create, and nothing here is a claim that the app is perfect.";

export const PLEDGE_SECTIONS = [
  {
    id: "account",
    title: "No account",
    body: "Yehsa does not ask you to create an account, sign in, or give an email address to use the app. You can open it and use what is already installed on this phone."
  },
  {
    id: "tracking",
    title: "No tracking",
    body: "Yehsa does not run an advertising tracker, and it does not follow you around the internet. It does not need a Yehsa login. If you later choose to send one question to a language model you connected yourself, that send happens only after you approve the exact question."
  },
  {
    id: "offline",
    title: "Works offline",
    body: "Ask, the field notes, the dictionary pack, maps you have already saved, and the mesh tools are meant to work without a cell signal or a Wi-Fi login. A missing radio, a denied permission, or a tool that is not on this phone is shown as it is. The app does not invent a result to look connected."
  },
  {
    id: "on-device",
    title: "Data stays on this phone",
    body: "Your questions, replies, learned notes, and saved places stay on this device unless you take a clear step to share them. Position lock stays off until you turn it on. Sharing a place, sending a short mesh note, or approving a model question are each their own step. A nearby Yehsa peer cannot run this install, and this screen does not upload a backup to a Yehsa server."
  },
  {
    id: "sources",
    title: "Where answers come from",
    body: "When a reply comes from an installed note, Yehsa shows a Source line with the note title and where it came from, such as a field note or a public-domain book. Quotes from the scripture index are what those texts say, not a verdict from Yehsa."
  },
  {
    id: "limits",
    title: "Honest limits",
    body: "This is a local tool, not a substitute for emergency services or professional care. It does not claim special protection or a sealed link, and it does not promise that every answer is complete. A frozen 411-question check lives in the repository as a development test. Nothing from that check is posted publicly until it has been reviewed."
  }
];

export const PLEDGE = [PLEDGE_LEAD, ...PLEDGE_SECTIONS.map((section) => `${section.title}. ${section.body}`)].join("\n\n");
