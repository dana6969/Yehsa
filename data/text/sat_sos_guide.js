// Offline guide to the satellite SOS feature built into some phones.
// Yehsa does not send satellite messages or place emergency calls.

export const SAT_SOS_TITLE = "Satellite SOS";

export const SAT_SOS_LEAD = "Some phones can send an emergency message by satellite when there is no cell signal. That is a feature of the phone, not of Yehsa. Yehsa does not make a satellite link and does not place an emergency call for you.";

export const SAT_SOS_SECTIONS = [
  {
    id: "call-first",
    title: "Try 911 or 112 first",
    body: "If you can already reach emergency services, use them first. In the United States that is 911. In much of Europe and in many other places it is 112. Use the number that works where you are. A voice call or a text to emergency services, when it goes through, is the usual first step. Satellite SOS is a backup when those paths are not available."
  },
  {
    id: "phones",
    title: "Which phones can do this",
    body: "Support depends on the phone, the software version, the country or region, and sometimes a plan or service from the phone maker. Some recent iPhone models include Emergency SOS via satellite. Some recent Android phones, including some Google Pixel models and some other makes, include a satellite emergency feature. Names, menus, and coverage change. Check your phone's settings — often under Emergency, SOS, or Safety — and the maker's guide for your exact model and location. This page does not keep a live model list."
  },
  {
    id: "sky",
    title: "Get a clear view of the sky",
    body: "Satellite messages need a fairly open view of the sky. Go outside if you can. Move away from roofs, vehicles, dense trees, tall buildings, and deep terrain that blocks the sky. Hold the phone the way the on-screen guide shows, and turn slowly if it asks you to. Connecting can take several minutes. Follow the phone's own prompts rather than any timing claimed here."
  },
  {
    id: "what-to-say",
    title: "What to say",
    body: "Keep answers short and factual. Say where you are, as clearly as you can (a place name, a trail, a road, or coordinates if you have them). Say what happened, how many people are with you, and any serious injuries. Say whether you can stay put or must move. Answer the questions the phone asks. If the phone lets you share a location, do that only if you want help to find you. Stay in place if you can do so safely, unless the phone or a responder tells you otherwise."
  },
  {
    id: "limits",
    title: "Limits of this guide",
    body: "This is general advice, not a promise that a message will send, that a satellite will be in view, or that help will arrive in a set time. Weather, terrain, battery, and local service rules can all get in the way. Yehsa does not send these messages, does not track the satellite, and does not replace 911 or 112."
  }
];

export const SAT_SOS = [SAT_SOS_LEAD, ...SAT_SOS_SECTIONS.map((section) => `${section.title}. ${section.body}`)].join("\n\n");
