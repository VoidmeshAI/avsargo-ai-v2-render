package com.avsargo.mobile;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import org.json.JSONArray;
import org.json.JSONObject;
import java.nio.charset.StandardCharsets;
import java.io.*;
import java.security.KeyStore;
import java.util.UUID;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Android Keystore-backed AES-GCM. Atomic app-private storage; compatible with V11 vault files. */
public final class SecureVault {
    private static final String KEY_ALIAS = "avsargo_android_v11_local_aes";
    private final Context ctx;
    public SecureVault(Context c) { this.ctx = c.getApplicationContext(); }

    private SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null);
        if (!store.containsAlias(KEY_ALIAS)) {
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256).setRandomizedEncryptionRequired(true).build());
            generator.generateKey();
        }
        return (SecretKey) store.getKey(KEY_ALIAS, null);
    }

    public byte[] seal(byte[] source) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key());
        byte[] iv = cipher.getIV(), encrypted = cipher.doFinal(source);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        out.write(iv.length); out.write(iv); out.write(encrypted);
        return out.toByteArray();
    }
    public byte[] unseal(byte[] packed) throws Exception {
        if (packed.length < 29) throw new IOException("Invalid encrypted file");
        int n = packed[0] & 0xff;
        if (n != 12 || packed.length < n + 17) throw new IOException("Invalid encryption header");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, packed, 1, n));
        return cipher.doFinal(packed, 1+n, packed.length-(1+n));
    }
    private File file(String filename) { return new File(ctx.getFilesDir(), filename); }
    private synchronized void writeEncrypted(String filename, byte[] data) throws Exception {
        File temp = file(filename + ".pending");
        try (FileOutputStream out = new FileOutputStream(temp)) { out.write(seal(data)); out.getFD().sync(); }
        File dest = file(filename);
        if (!temp.renameTo(dest)) { temp.delete(); throw new IOException("Secure write failed"); }
    }
    private byte[] readEncrypted(String filename) throws Exception {
        File f = file(filename); if (!f.exists()) return null;
        try (FileInputStream in = new FileInputStream(f)) { return unseal(readLimited(in, 18*1024*1024)); }
    }
    public synchronized void saveProfile(JSONObject profile) throws Exception {
        // Profile contains only user-reviewed form fields, not login credentials or document identifiers.
        writeEncrypted("profile.sec", profile.toString().getBytes(StandardCharsets.UTF_8));
    }
    public synchronized JSONObject getProfile() throws Exception {
        byte[] data = readEncrypted("profile.sec");
        return data == null ? new JSONObject() : new JSONObject(new String(data, StandardCharsets.UTF_8));
    }
    public synchronized void setGeminiKey(String key) throws Exception {
        if (key.isEmpty()) { file("gemini.sec").delete(); return; }
        if (key.length() < 12 || key.length() > 320) throw new IllegalArgumentException("Invalid key length");
        writeEncrypted("gemini.sec", key.getBytes(StandardCharsets.UTF_8));
    }
    public synchronized String getGeminiKey() throws Exception {
        byte[] data = readEncrypted("gemini.sec");
        return data == null ? "" : new String(data,StandardCharsets.UTF_8);
    }
    public synchronized JSONArray documents() throws Exception {
        byte[] data = readEncrypted("documents.sec");
        return data == null ? new JSONArray() : new JSONArray(new String(data, StandardCharsets.UTF_8));
    }
    /** Save file bytes and encrypted metadata. 8 MB cap; permitted MIME only. */
    public synchronized JSONObject addDocument(String name, String mime, byte[] data) throws Exception {
        if (!("application/pdf".equals(mime) || "image/png".equals(mime) || "image/jpeg".equals(mime))) throw new IllegalArgumentException("PDF, PNG or JPG only");
        if (data.length < 1 || data.length > 8*1024*1024) throw new IllegalArgumentException("Maximum 8 MB");
        boolean pdf="application/pdf".equals(mime)&&data.length>=5&&new String(data,0,5,StandardCharsets.US_ASCII).equals("%PDF-");
        boolean png="image/png".equals(mime)&&data.length>=8&&(data[0]&255)==137&&data[1]==80&&data[2]==78&&data[3]==71;
        boolean jpg="image/jpeg".equals(mime)&&data.length>=3&&(data[0]&255)==255&&(data[1]&255)==216&&(data[2]&255)==255;
        if(!pdf&&!png&&!jpg)throw new IllegalArgumentException("File content does not match PDF/JPG/PNG type");
        JSONArray index = documents(); if (index.length() >= 15) throw new IllegalArgumentException("Maximum 15 documents in local beta");
        String id = UUID.randomUUID().toString();
        JSONObject item = new JSONObject().put("id",id).put("name",name.substring(0,Math.min(name.length(),90)))
            .put("mime",mime).put("size",data.length).put("created",System.currentTimeMillis());
        writeEncrypted("doc_"+id+".sec", data);
        try { index.put(item); writeEncrypted("documents.sec",index.toString().getBytes(StandardCharsets.UTF_8)); }
        catch (Exception e) { file("doc_"+id+".sec").delete(); throw e; }
        return item;
    }
    public synchronized byte[] documentData(String id) throws Exception {
        if (!id.matches("[0-9a-fA-F-]{36}")) throw new SecurityException("Bad document ID");
        JSONArray index = documents();
        boolean found=false; for(int i=0;i<index.length();i++) if(id.equals(index.getJSONObject(i).getString("id")))found=true;
        if(!found) throw new SecurityException("Document not available");
        return readEncrypted("doc_"+id+".sec");
    }
    public synchronized JSONObject documentMeta(String id) throws Exception {
        JSONArray a = documents();for(int i=0;i<a.length();i++){ JSONObject v=a.getJSONObject(i); if(id.equals(v.getString("id")))return v; }
        throw new SecurityException("Document not available");
    }
    public synchronized void removeDocument(String id) throws Exception {
        JSONArray current = documents(), changed=new JSONArray();boolean found=false;
        for (int i=0;i<current.length();i++) {JSONObject j=current.getJSONObject(i);if(id.equals(j.getString("id")))found=true;else changed.put(j);}
        if(!found)throw new SecurityException("Unknown document");
        writeEncrypted("documents.sec",changed.toString().getBytes(StandardCharsets.UTF_8));
        file("doc_"+id+".sec").delete();
    }
    public synchronized void saveWorkspace(JSONObject data) throws Exception {
        if(data.toString().length()>180000)throw new IllegalArgumentException("Chat storage limit reached");
        writeEncrypted("workspace.sec",data.toString().getBytes(StandardCharsets.UTF_8));
    }
    public synchronized JSONObject workspace() throws Exception {
        byte[] bytes=readEncrypted("workspace.sec");return bytes==null?new JSONObject():new JSONObject(new String(bytes,StandardCharsets.UTF_8));
    }
    public synchronized void saveAiSettings(JSONObject config) throws Exception {
        writeEncrypted("ai-settings.sec",config.toString().getBytes(StandardCharsets.UTF_8));
    }
    public synchronized JSONObject aiSettings() throws Exception {
        byte[] bytes=readEncrypted("ai-settings.sec");return bytes==null?new JSONObject():new JSONObject(new String(bytes,StandardCharsets.UTF_8));
    }
    public synchronized void eraseAll() throws Exception {
        // Deletion must also work when the metadata index is corrupt.
        File[] files=ctx.getFilesDir().listFiles();
        if(files!=null)for(File f:files){
            String n=f.getName();if(n.equals("profile.sec")||n.equals("documents.sec")||n.equals("gemini.sec")||n.equals("workspace.sec")||n.equals("ai-settings.sec")||n.startsWith("doc_")||n.endsWith(".pending"))
                if(f.exists()&&!f.delete())throw new IOException("Could not delete saved data");
        }
        KeyStore store=KeyStore.getInstance("AndroidKeyStore");store.load(null);if(store.containsAlias(KEY_ALIAS))store.deleteEntry(KEY_ALIAS);
    }
    public static byte[] readLimited(InputStream in, int limit) throws IOException {
        ByteArrayOutputStream output=new ByteArrayOutputStream();byte[] chunk=new byte[16384];int count;
        while((count=in.read(chunk))!=-1){if(output.size()+count>limit)throw new IOException("Document exceeds size limit");output.write(chunk,0,count);}
        return output.toByteArray();
    }
}
