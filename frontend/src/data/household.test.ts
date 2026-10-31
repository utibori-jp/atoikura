import { invitationLink, joinTokenFromHash } from "./household";

describe("invitation links", () => {
  it("puts the token in the fragment and reads it back", () => {
    const invitation_url = new URL(
      invitationLink("tok/en+1", { origin: "https://app.test", pathname: "/" } as Location)
    );
    expect(invitation_url.origin + invitation_url.pathname).toBe("https://app.test/");
    expect(invitation_url.search).toBe("");
    expect(joinTokenFromHash(invitation_url.hash)).toBe("tok/en+1");
  });

  it("ignores other fragments and malformed tokens", () => {
    expect(joinTokenFromHash("")).toBeNull();
    expect(joinTokenFromHash("#top")).toBeNull();
    expect(joinTokenFromHash("#join=")).toBeNull();
    expect(joinTokenFromHash("#join=%E0%A4%A")).toBeNull();
  });
});
