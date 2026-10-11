package com.avsargo.mobile;
import android.app.Activity;
import android.graphics.*;
import android.graphics.pdf.PdfRenderer;
import android.media.ExifInterface;
import android.os.ParcelFileDescriptor;
import android.util.Base64;
import com.google.android.gms.tasks.Tasks;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.*;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;
import com.google.mlkit.vision.text.devanagari.DevanagariTextRecognizerOptions;
import org.json.*;
import java.io.*;
import java.util.*;
import java.util.concurrent.TimeUnit;
/** Processes one page at a time. Encrypted scan includes text and bounded vision previews. */
public final class DocumentOcr {
 public interface Listener {void result(JSONObject scan);void error(String message);default void progress(int done,int total){}}
 private final Activity activity;
 public DocumentOcr(Activity a){activity=a;}
 public void recognize(byte[] bytes,String mime,Listener listener){new Thread(()->{
  File temp=null;TextRecognizer latin=TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS),hindi=TextRecognition.getClient(new DevanagariTextRecognizerOptions.Builder().build());
  StringBuilder text=new StringBuilder();JSONArray images=new JSONArray();int total=1,done=0;boolean truncated=false;
  try{
   if("application/pdf".equals(mime)){temp=File.createTempFile("ocr_",".pdf",activity.getCacheDir());try(FileOutputStream out=new FileOutputStream(temp)){out.write(bytes);}
    try(ParcelFileDescriptor fd=ParcelFileDescriptor.open(temp,ParcelFileDescriptor.MODE_READ_ONLY);PdfRenderer pdf=new PdfRenderer(fd)){total=pdf.getPageCount();if(total<1)throw new IOException("Empty PDF");truncated=total>20;
     for(int i=0;i<Math.min(total,20);i++){Bitmap bitmap;try(PdfRenderer.Page page=pdf.openPage(i)){float scale=Math.min(2.5f,Math.min(1900f/page.getWidth(),2600f/page.getHeight()));bitmap=Bitmap.createBitmap(Math.max(1,Math.round(page.getWidth()*scale)),Math.max(1,Math.round(page.getHeight()*scale)),Bitmap.Config.ARGB_8888);bitmap.eraseColor(Color.WHITE);page.render(bitmap,null,null,PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);}
      try{append(bitmap,i+1,text,images,latin,hindi);}finally{bitmap.recycle();}done++;final int n=done,t=total;activity.runOnUiThread(()->listener.progress(n,t));
     }
    }
   }else{BitmapFactory.Options opt=new BitmapFactory.Options();opt.inJustDecodeBounds=true;BitmapFactory.decodeByteArray(bytes,0,bytes.length,opt);opt.inSampleSize=1;while(Math.max(opt.outWidth,opt.outHeight)/opt.inSampleSize>2400)opt.inSampleSize*=2;opt.inJustDecodeBounds=false;Bitmap bitmap=BitmapFactory.decodeByteArray(bytes,0,bytes.length,opt);if(bitmap==null)throw new IOException("Image could not be read");
    try{try{ExifInterface exif=new ExifInterface(new ByteArrayInputStream(bytes));int o=exif.getAttributeInt(ExifInterface.TAG_ORIENTATION,1);Matrix m=new Matrix();if(o==2||o==4||o==5||o==7)m.postScale(-1,1);if(o==6||o==5)m.postRotate(90);if(o==3||o==4)m.postRotate(180);if(o==8||o==7)m.postRotate(270);if(o!=1){Bitmap b=Bitmap.createBitmap(bitmap,0,0,bitmap.getWidth(),bitmap.getHeight(),m,true);if(b!=bitmap){bitmap.recycle();bitmap=b;}}}catch(Exception ignored){}append(bitmap,1,text,images,latin,hindi);done=1;}finally{bitmap.recycle();}
   }
   truncated|=text.length()>48000;String raw=text.substring(0,Math.min(48000,text.length()));JSONObject scan=new JSONObject().put("text",raw).put("fields",parseFields(raw)).put("images",images).put("pages",done).put("totalPages",total).put("truncated",truncated);activity.runOnUiThread(()->listener.result(scan));
  }catch(Exception e){activity.runOnUiThread(()->listener.error("Document scan failed. Use a clear, unlocked PDF or image."));}finally{latin.close();hindi.close();if(temp!=null)temp.delete();}
 },"avsargo-document-scan").start();}
 private static void append(Bitmap bitmap,int page,StringBuilder all,JSONArray images,TextRecognizer latin,TextRecognizer hindi)throws Exception{
  LinkedHashSet<String> lines=new LinkedHashSet<>();boolean success=false;for(TextRecognizer r:new TextRecognizer[]{latin,hindi})try{Text t=Tasks.await(r.process(InputImage.fromBitmap(bitmap,0)),45,TimeUnit.SECONDS);for(Text.TextBlock block:t.getTextBlocks())for(Text.Line line:block.getLines()){String s=line.getText().trim();if(!s.isEmpty())lines.add(s);}success=true;}catch(Exception ignored){}
  if(!success)throw new IOException("OCR unavailable");String joined=String.join("\n",lines);all.append("[Page ").append(page).append("]\n").append(joined).append('\n');
  // Front/back or cover plus first continuation page; never an unbounded full file upload.
  if(images.length()<2){float scale=Math.min(1f,1200f/Math.max(bitmap.getWidth(),bitmap.getHeight()));Bitmap preview=Bitmap.createScaledBitmap(bitmap,Math.max(1,Math.round(bitmap.getWidth()*scale)),Math.max(1,Math.round(bitmap.getHeight()*scale)),true);try{ByteArrayOutputStream out=new ByteArrayOutputStream();int quality=78;do{out.reset();preview.compress(Bitmap.CompressFormat.JPEG,quality,out);quality-=12;}while(out.size()>180000&&quality>=18);if(out.size()<=195000)images.put(new JSONObject().put("page",page).put("mime","image/jpeg").put("data",Base64.encodeToString(out.toByteArray(),Base64.NO_WRAP)));}finally{if(preview!=bitmap)preview.recycle();}}
 }
 public static JSONObject parseFields(String text){return new JSONObject(ProfileRules.fromOcr(text));}
}
