// Semua topik mode terpandu AR Helpdesk: topik tulisan tangan + topik otomatis per halaman dari MENU_HELP.
import { HAND_TOPICS, pageTopics } from "./helpdesk-topics";
import { MENU_HELP } from "./menu-help";

export const HELP_TOPICS = [...HAND_TOPICS, ...pageTopics(MENU_HELP)];
