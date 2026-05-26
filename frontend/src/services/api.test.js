import axios from "axios";
import { uploadPdfApi } from "./api";

jest.mock("axios");

describe("api.js", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("uploadPdfApi", () => {
    it("should post to /upload with correct FormData", async () => {
      const mockResponse = { data: { session_id: "1234" } };
      axios.post.mockResolvedValueOnce(mockResponse);

      const file = new File(["content"], "test.pdf", { type: "application/pdf" });
      
      const result = await uploadPdfApi(file, "session-1", "secret-1");

      expect(result).toEqual(mockResponse.data);
      expect(axios.post).toHaveBeenCalledTimes(1);
      
      const [url, formData, config] = axios.post.mock.calls[0];
      
      expect(url).toMatch(/\/upload$/);
      expect(formData.get("file")).toBe(file);
      expect(formData.get("session_id")).toBe("session-1");
      expect(formData.get("session_secret")).toBe("secret-1");
      expect(config.timeout).toBe(30000);
    });

    it("should post to /upload without session details if not provided", async () => {
      const mockResponse = { data: { session_id: "5678" } };
      axios.post.mockResolvedValueOnce(mockResponse);

      const file = new File(["content"], "test.pdf", { type: "application/pdf" });
      
      const result = await uploadPdfApi(file);

      expect(result).toEqual(mockResponse.data);
      expect(axios.post).toHaveBeenCalledTimes(1);
      
      const [url, formData, config] = axios.post.mock.calls[0];
      
      expect(url).toMatch(/\/upload$/);
      expect(formData.get("file")).toBe(file);
      expect(formData.has("session_id")).toBe(false);
      expect(formData.has("session_secret")).toBe(false);
      expect(config.timeout).toBe(30000);
    });
  });
});
