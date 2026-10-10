package com.avsargo.mobile;

import org.json.JSONArray;
import org.json.JSONObject;
import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/** Real conversational Gemini API client. Sends only opted-in typed chat, never documents or profile values. */
public final class GeminiAssistant {
    public interface Callback {void done(String message, boolean success);}
    private final SecureVault vault;
    public GeminiAssistant(SecureVault v){vault=v;}
    public void sendConversation(JSONObject conversation, Callback callback) {
        new Thread(()->{
            try {
                String key=vault.getGeminiKey();if(key.isEmpty()){callback.done("Gemini key not configured. Open Settings.",false);return;}
                JSONArray messages=conversation.optJSONArray("messages");
                if(messages==null||messages.length()==0)throw new IllegalArgumentException("Type a message first");
                if(messages.length()>24||messages.toString().length()>40000)throw new IllegalArgumentException("Chat context too long");
                String selected=vault.aiSettings().optString("model","");
                List<String> models=selected.isEmpty()?availableModels(key):java.util.Collections.singletonList(selected);
                if(models.isEmpty())throw new IOException("No compatible text models found in this API key's model list");
                // Exactly one model request; never silently switch to another paid/unknown model.
                callback.done(generate(key,models.get(0),messages),true);
            } catch(Exception e){callback.done("Gemini: "+safeError(e.getMessage()),false);}
        },"avsargo-ai-chat").start();
    }
    private List<String> availableModels(String key)throws Exception {
        JSONObject root=request("GET","https://generativelanguage.googleapis.com/v1beta/models",key,null);
        JSONArray array=root.optJSONArray("models");ArrayList<String> list=new ArrayList<>();
        if(array!=null)for(int i=0;i<array.length();i++) {
            JSONObject m=array.getJSONObject(i);
            String n=m.optString("name","");JSONArray methods=m.optJSONArray("supportedGenerationMethods");
            boolean canGenerate=false;if(methods!=null)for(int j=0;j<methods.length();j++)if("generateContent".equals(methods.optString(j)))canGenerate=true;
            String lower=n.toLowerCase(java.util.Locale.ROOT);
            if(canGenerate&&n.startsWith("models/")&&lower.contains("gemini")&&lower.contains("flash")&&
                !lower.matches(".*(tts|audio|speech|image|imagen|video|embedding|live|native|vision-only|exp-image).*"))list.add(n.substring(7));
        }
        list.sort((a,b)->Integer.compare(rank(a),rank(b)));
        return list;
    }
    private int rank(String n) {
        String s=n.toLowerCase(java.util.Locale.ROOT);
        if(s.equals("gemini-2.5-flash-lite"))return 0;
        if(s.contains("flash-lite")&&!s.contains("preview"))return 1;
        if(s.contains("flash-lite"))return 2;
        if(s.contains("flash")&&!s.contains("preview"))return 3;
        return 4;
    }
    private String generate(String key,String model,JSONArray messages)throws Exception{
        JSONArray contents=new JSONArray();
        for(int i=0;i<messages.length();i++){
            JSONObject item=messages.getJSONObject(i);String role=item.optString("role"),text=item.optString("text").trim();
            if(!role.equals("user")&&!role.equals("assistant"))continue;
            if(text.length()>5000)text=text.substring(0,5000);if(text.isEmpty())continue;
            contents.put(new JSONObject().put("role",role.equals("assistant")?"model":"user")
                .put("parts",new JSONArray().put(new JSONObject().put("text",text))));
        }
        if(contents.length()==0)throw new IOException("No typed chat context");
        JSONObject system=new JSONObject().put("parts",new JSONArray().put(new JSONObject().put("text",
            "You are AvsarGo, an independent Indian government application preparation assistant. " +
            "Help identify forms, documents, steps and eligibility accurately. Dates, costs and rules must be verified at official websites. " +
            "Never ask for or collect login passwords, OTPs, CAPTCHA answers, payment secrets, PAN or Aadhaar numbers. " +
            "The app can help with document upload, verified-profile preparation and supported in-app website field autofill, " +
            "but user alone logs in, solves CAPTCHA, pays fees, signs and submits. Do not imply government affiliation. " +
            "The chat is a native mobile application with a private document picker and an in-app browser. " +
            "For a new form request ask what service/exam, state and application type are needed, then ask for relevant documents. " +
            "Do not claim you opened a portal or filled a field: browser actions run only through explicit app controls. " +
            "Do not treat every exam as SSC; unknown services need their official application link. " +
            "You cannot browse or verify live deadlines in this API call, so label document lists as indicative and ask users to check the official notice. " +
            "Reply naturally in the user's Hinglish/Hindi/English style, concise and helpful.")));
        JSONObject body=new JSONObject().put("contents",contents).put("systemInstruction",system)
          .put("generationConfig",new JSONObject().put("temperature",0.35).put("maxOutputTokens",600));
        JSONObject response=request("POST","https://generativelanguage.googleapis.com/v1beta/models/"+model+":generateContent",key,body);
        JSONArray candidates=response.optJSONArray("candidates");
        if(candidates==null||candidates.length()==0)throw new IOException("Google returned no response candidates");
        JSONObject content=candidates.getJSONObject(0).optJSONObject("content");
        if(content==null)throw new IOException("No AI text returned");
        JSONArray parts=content.optJSONArray("parts");
        StringBuilder out=new StringBuilder();if(parts!=null)for(int i=0;i<parts.length();i++)out.append(parts.getJSONObject(i).optString("text",""));
        if(out.toString().trim().isEmpty())throw new IOException("Empty AI response");
        return out.toString().trim();
    }
    private JSONObject request(String method,String url,String key,JSONObject body)throws Exception {
        HttpURLConnection conn=(HttpURLConnection)new URL(url).openConnection();
        try{
            conn.setInstanceFollowRedirects(false);conn.setRequestMethod(method);conn.setConnectTimeout(12000);conn.setReadTimeout(22000);
            conn.setRequestProperty("x-goog-api-key",key);
            conn.setRequestProperty("Accept","application/json");
            if(body!=null){conn.setDoOutput(true);conn.setRequestProperty("Content-Type","application/json; charset=utf-8");
              try(OutputStream os=conn.getOutputStream()){os.write(body.toString().getBytes(StandardCharsets.UTF_8));}}
            int status=conn.getResponseCode();InputStream source=status<400?conn.getInputStream():conn.getErrorStream();
            String text="";if(source!=null)try(InputStream input=source){text=new String(SecureVault.readLimited(input,100000),StandardCharsets.UTF_8);}
            if(status>=300){String safe="HTTP "+status;try{JSONObject e=new JSONObject(text).optJSONObject("error");if(e!=null)safe+=" — "+safeError(e.optString("message",""));}catch(Exception ignored){}throw new ApiException(status,safe);}
            return new JSONObject(text);
        }finally{conn.disconnect();}
    }
    private static String safeError(String s){
        if(s==null)return "Unknown error";
        // Error messages can contain URLs and key-like values: avoid returning long raw provider text.
        String sanitized=s.replaceAll("AIza[0-9A-Za-z_\\-]+","[API key hidden]");
        sanitized=sanitized.replaceAll("(?i)(api[ _-]?key|token|authorization)\\s*[:=]\\s*[^\\s,;]+","$1=[hidden]");
        return sanitized.substring(0,Math.min(sanitized.length(),210));
    }
    private static final class ApiException extends IOException{
        final int httpCode;ApiException(int code,String m){super(m);httpCode=code;}
    }
}
