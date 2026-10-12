import { abandonConversation, finalizeConversation } from "./conversation-finalize";
import {
  closeConversation,
  countUserMessages,
  markEmailResult,
  refreshConversationTotals,
} from "./conversation-store";
import { sendConversationEmail } from "./email";

jest.mock("./conversation-store", () => ({
  closeConversation: jest.fn(),
  countUserMessages: jest.fn(),
  markEmailResult: jest.fn(),
  refreshConversationTotals: jest.fn(),
}));

jest.mock("./email", () => ({
  sendConversationEmail: jest.fn(),
}));

const mockCloseConversation = jest.mocked(closeConversation);
const mockCountUserMessages = jest.mocked(countUserMessages);
const mockMarkEmailResult = jest.mocked(markEmailResult);
const mockRefreshConversationTotals = jest.mocked(refreshConversationTotals);
const mockSendConversationEmail = jest.mocked(sendConversationEmail);

const CONVERSATION_ID = "conv_1";
const CLOSED_CONVERSATION = {
  id: CONVERSATION_ID,
  lead: { name: "Maria" },
  ip: "200.100.50.25",
  ipCity: null,
  ipRegion: null,
  ipCountry: "Brazil",
  ipNetwork: "Operadora X",
  messages: [
    { role: "ASSISTANT", content: "Olá" },
    { role: "USER", content: "Maria" },
  ],
} as unknown as Awaited<ReturnType<typeof refreshConversationTotals>>;

describe("finalizeConversation", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("sends the email once and records the delivery", async () => {
    mockCloseConversation.mockResolvedValue(true);
    mockRefreshConversationTotals.mockResolvedValue(CLOSED_CONVERSATION);
    mockSendConversationEmail.mockResolvedValue("sent");

    await expect(finalizeConversation(CONVERSATION_ID, "COMPLETED")).resolves.toBe("finalized");

    expect(mockSendConversationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "COMPLETED",
        lead: { name: "Maria" },
        location: { city: null, region: null, country: "Brazil", network: "Operadora X" },
      }),
    );
    expect(mockMarkEmailResult).toHaveBeenCalledWith(CONVERSATION_ID, null);
  });

  it("does nothing when another request already closed the conversation", async () => {
    mockCloseConversation.mockResolvedValue(false);

    await expect(finalizeConversation(CONVERSATION_ID, "COMPLETED")).resolves.toBe("already-closed");

    expect(mockRefreshConversationTotals).not.toHaveBeenCalled();
    expect(mockSendConversationEmail).not.toHaveBeenCalled();
  });

  it("records the error when the email provider fails", async () => {
    mockCloseConversation.mockResolvedValue(true);
    mockRefreshConversationTotals.mockResolvedValue(CLOSED_CONVERSATION);
    mockSendConversationEmail.mockRejectedValue(new Error("domain not verified"));

    await expect(finalizeConversation(CONVERSATION_ID, "COMPLETED")).resolves.toBe("finalized");

    expect(mockMarkEmailResult).toHaveBeenCalledWith(CONVERSATION_ID, "domain not verified");
  });

  it("records that email is not configured instead of marking it as sent", async () => {
    mockCloseConversation.mockResolvedValue(true);
    mockRefreshConversationTotals.mockResolvedValue(CLOSED_CONVERSATION);
    mockSendConversationEmail.mockResolvedValue("logged");

    await finalizeConversation(CONVERSATION_ID, "COMPLETED");

    expect(mockMarkEmailResult).toHaveBeenCalledWith(
      CONVERSATION_ID,
      expect.stringContaining("não configurado"),
    );
  });
});

describe("abandonConversation", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("closes silently when the visitor never replied", async () => {
    mockCountUserMessages.mockResolvedValue(0);
    mockCloseConversation.mockResolvedValue(true);

    await expect(abandonConversation(CONVERSATION_ID)).resolves.toBe("finalized");

    expect(mockCloseConversation).toHaveBeenCalledWith(CONVERSATION_ID, "ABANDONED");
    expect(mockSendConversationEmail).not.toHaveBeenCalled();
  });

  it("emails the partial conversation when the visitor replied", async () => {
    mockCountUserMessages.mockResolvedValue(2);
    mockCloseConversation.mockResolvedValue(true);
    mockRefreshConversationTotals.mockResolvedValue(CLOSED_CONVERSATION);
    mockSendConversationEmail.mockResolvedValue("sent");

    await abandonConversation(CONVERSATION_ID);

    expect(mockSendConversationEmail).toHaveBeenCalledWith(
      expect.objectContaining({ status: "ABANDONED" }),
    );
  });
});
