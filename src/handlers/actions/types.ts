import type { proto, WASocket } from "@whiskeysockets/baileys";
import type { AgentCall } from "../../services/ai.js";
import type { DeviceInfo, DeviceSwitchEvent, UserProfile } from "../../services/user.ts";

export type WAMessage = proto.IWebMessageInfo;

export interface ActionContext {
  sock: WASocket;
  msg: WAMessage;
  remoteJid: string;
  user: UserProfile;
  deviceInfo: DeviceInfo;
  deviceSwitch?: DeviceSwitchEvent | null;
  switchNotice: string;
  plan: AgentCall;
  rawText: string;
}

export type ActionHandler = (ctx: ActionContext) => Promise<void>;
