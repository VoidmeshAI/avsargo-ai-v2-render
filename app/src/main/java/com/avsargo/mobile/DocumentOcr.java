package com.avsargo.mobile;

import android.app.Activity;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.graphics.pdf.PdfRenderer;
import android.graphics.Matrix;
import android.media.ExifInterface;
import java.io.ByteArrayInputStream;
import android.os.ParcelFileDescriptor;
import com.google.android.gms.tasks.Task;
import com.google.android.gms.tasks.Tasks;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.Text;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;
import com.google.mlkit.vision.text.devanagari.DevanagariTextRecognizerOptions;
import com.google.mlkit.vision.text.TextRecognizer;
import org.json.JSONObject;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.regex.*;

/** On-device OCR. Bounded scan text can be analysed by AI after a separate user consent. */
public final class DocumentOcr {
    public interface Listener { void result(JSONObject scan); void error(String message); }
    private final Activity activity;
    public DocumentOcr(Activity activity) {this.activity=activity;}

    public void recognize(byte[] bytes,String mime,Listener callback) {
        new Thread(() -> {
            try {
                final ArrayList<Bitmap> pages = new ArrayList<>();
                int totalPages=1;
                if ("application/pdf".equals(mime)) {
                    // Android PdfRenderer requires a seekable file descriptor. Temporary plaintext remains
                    // only in the app-private cache, then deleted in finally, even on an OCR error.
                    File temp=File.createTempFile("ocr_", ".pdf", activity.getCacheDir());
                    try {
                        try(FileOutputStream out=new FileOutputStream(temp)){out.write(bytes);out.getFD().sync();}
                        try(ParcelFileDescriptor fd=ParcelFileDescriptor.open(temp,ParcelFileDescriptor.MODE_READ_ONLY);
                            PdfRenderer renderer=new PdfRenderer(fd)) {
                            totalPages=renderer.getPageCount();int n=Math.min(3,totalPages);
                            for(int i=0;i<n;i++) try(PdfRenderer.Page p=renderer.openPage(i)) {
                                int w=Math.max(1,p.getWidth()),h=Math.max(1,p.getHeight());
                                float scale=Math.min(2.0f,Math.min(1900f/w,2600f/h));
                                int bw=Math.min(1900,Math.max(1,Math.round(w*scale))), bh=Math.min(2600,Math.max(1,Math.round(h*scale)));
                                Bitmap bm=Bitmap.createBitmap(bw,bh,Bitmap.Config.ARGB_8888);bm.eraseColor(Color.WHITE);
                                p.render(bm,null,null,PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);pages.add(bm);
                            }
                        }
                    }finally{temp.delete();}
                } else {
                    BitmapFactory.Options opts = new BitmapFactory.Options();opts.inJustDecodeBounds=true;
                    BitmapFactory.decodeByteArray(bytes,0,bytes.length,opts);
                    int sample=1;while(Math.max(opts.outWidth,opts.outHeight)/sample>2000)sample*=2;
                    opts.inJustDecodeBounds=false;opts.inSampleSize=sample;
                    Bitmap bm=BitmapFactory.decodeByteArray(bytes,0,bytes.length,opts);
                    if(bm==null)throw new IllegalArgumentException("Cannot decode image");
                    try{
                        ExifInterface exif=new ExifInterface(new ByteArrayInputStream(bytes));
                        int orient=exif.getAttributeInt(ExifInterface.TAG_ORIENTATION,ExifInterface.ORIENTATION_NORMAL);
                        int rotation=(orient==6||orient==5)?90:(orient==3||orient==4)?180:(orient==8||orient==7)?270:0;
                        boolean flipped=orient==2||orient==4||orient==5||orient==7;
                        if(rotation!=0||flipped){Matrix matrix=new Matrix();if(flipped)matrix.postScale(-1,1);matrix.postRotate(rotation);
                            Bitmap upright=Bitmap.createBitmap(bm,0,0,bm.getWidth(),bm.getHeight(),matrix,true);if(upright!=bm){bm.recycle();bm=upright;}}
                    }catch(Exception ignored){}
                    pages.add(bm);
                }
                if(pages.isEmpty())throw new IllegalArgumentException("Empty document");
                final int pageCount=totalPages;activity.runOnUiThread(()-> recognizeAllPages(pages,pageCount,callback));
            } catch(Exception e) {activity.runOnUiThread(()->callback.error("OCR failed: "+e.getMessage()));}
        },"avsargo-ocr-prepare").start();
    }

    private void recognizeAllPages(ArrayList<Bitmap> pages,int totalPages,Listener cb) {
        TextRecognizer latin=TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);
        TextRecognizer hindi=TextRecognition.getClient(new DevanagariTextRecognizerOptions.Builder().build());
        StringBuilder result=new StringBuilder();
        scanPage(pages,0,totalPages,latin,hindi,result,cb);
    }
    private void scanPage(ArrayList<Bitmap> pages,int i,int totalPages,TextRecognizer latin,TextRecognizer hindi,StringBuilder all,Listener cb) {
        if(i>=pages.size()) {
            latin.close();hindi.close();
            String raw=all.toString(),text=raw.substring(0,Math.min(raw.length(),12000));JSONObject scan=new JSONObject();
            try{scan.put("fields",parseFields(text)).put("text",text).put("pages",pages.size()).put("totalPages",totalPages).put("truncated",totalPages>pages.size()||raw.length()>12000);}catch(Exception ignored){}
            cb.result(scan);return;
        }
        Bitmap bitmap=pages.get(i);
        InputImage img=InputImage.fromBitmap(bitmap,0);
        Task<Text> a=latin.process(img),b=hindi.process(img);
        Tasks.whenAllComplete(a,b).addOnCompleteListener(t->{
            if(!a.isSuccessful()&&!b.isSuccessful()){
                for(int j=i;j<pages.size();j++)if(!pages.get(j).isRecycled())pages.get(j).recycle();
                latin.close();hindi.close();cb.error("Text recognition could not run. Try a clearer image or enter reviewed details manually.");return;
            }
            if(a.isSuccessful())all.append(a.getResult().getText()).append('\n');
            if(b.isSuccessful())all.append(b.getResult().getText()).append('\n');
            bitmap.recycle();
            scanPage(pages,i+1,totalPages,latin,hindi,all,cb);
        });
    }
    public static JSONObject parseFields(String text) {return new JSONObject(ProfileRules.fromOcr(text));}
}
