// Small entry for standalone screens the More menu can link to.
// This file does not restructure the main phone shell.

export { default as TrustScreen } from "./TrustScreen.js";
export { default as SatSosGuide } from "./SatSosGuide.js";
export { default as HotspotGuide } from "./HotspotGuide.js";

export { PLEDGE, PLEDGE_LEAD, PLEDGE_SECTIONS, PLEDGE_TITLE } from "../../data/text/no_account_pledge.js";
export { SAT_SOS, SAT_SOS_LEAD, SAT_SOS_SECTIONS, SAT_SOS_TITLE } from "../../data/text/sat_sos_guide.js";
export { HOTSPOT, HOTSPOT_LEAD, HOTSPOT_SECTIONS, HOTSPOT_TITLE } from "../../data/text/hotspot_guide.js";

// Screens and helpers from the packs/books work. YehsaApp.js (or the nav shell) imports from here.
// Importing this file starts loading your imported books in the background so Ask can use them.
import { bootImportedBooks } from "./imported_books.js";

export { default as BeforeYouGo } from "./BeforeYouGo.js";
export { default as DownloadArea } from "./DownloadArea.js";
export { default as BooksPane } from "./BooksPane.js";
export { default as StatusRow } from "./parts/StatusRow.js";
export { areaDemLayers } from "./area_tiles.js";
export { loadAreas } from "./area_store";
export { bootImportedBooks, importBookBytes, removeBook } from "./imported_books.js";
export { beforeYouGo, tripPlanText } from "../../symbolic/before_you_go.js";
export { coverageFor, planArea, visibleBox } from "../../symbolic/area_download.js";

bootImportedBooks();

export { default as CameraIdScreen } from "./CameraIdScreen.js";
