export type AuthenticatedUser = {
  id: string;
  googleSub: string;
  email: string;
  name: string | null;
  picture: string | null;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  streaming: boolean;
};

export type WorkspaceSnapshot = {
  gmailThreads: Array<{
    id: string;
    subject: string;
    sender: string;
    preview: string;
    updatedAt: string;
    unread: boolean;
  }>;
  calendarEvents: Array<{
    id: string;
    title: string;
    startTime: string;
    endTime: string;
    location?: string;
  }>;
  updatedAt: string;
};