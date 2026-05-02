import { Inngest } from "inngest";

export const inngest = new Inngest({ 
  id: "tom-ai",
  eventKey: process.env.INNGEST_EVENT_KEY,
});
