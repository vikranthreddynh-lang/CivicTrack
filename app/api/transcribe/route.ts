import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !token) return NextResponse.json({ demo: true, message: "Add a Cloudflare token for Whisper transcription. You can also use browser speech recognition or edit the transcript." }, { status: 200 });
  try {
    const form = await request.formData();
    const audio = form.get("audio");
    if (!(audio instanceof File)) return NextResponse.json({ error: "Record or choose an audio file first." }, { status: 400 });
    const audioBytes = await audio.arrayBuffer();
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/openai/whisper`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ audio: Buffer.from(audioBytes).toString("base64") })
    });
    const data = await response.json();
    if (!response.ok || !data.success) return NextResponse.json({ error: "Transcription service unavailable. Try browser voice input or type the details." }, { status: 502 });
    return NextResponse.json({ text: data.result?.text ?? "" });
  } catch {
    return NextResponse.json({ error: "Could not transcribe this recording. Try browser voice input or type the details." }, { status: 500 });
  }
}
