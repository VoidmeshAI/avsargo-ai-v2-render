package com.avsargo.mobile;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import org.json.JSONObject;
import java.io.FileNotFoundException;
import java.io.OutputStream;

/** Read-only user-granted URI. Streams decrypted bytes through a pipe, never a plaintext disk file. */
public final class SecureDocumentProvider extends ContentProvider {
    @Override public boolean onCreate(){return true;}
    private String id(Uri uri)throws FileNotFoundException{
        if(!"content".equals(uri.getScheme())||uri.getPathSegments().size()!=1)throw new FileNotFoundException("Invalid document URI");
        String id=uri.getLastPathSegment();if(id==null||!id.matches("[0-9a-fA-F-]{36}"))throw new FileNotFoundException("Invalid document");return id;
    }
    @Override public String getType(Uri uri){try{return new SecureVault(getContext()).documentMeta(id(uri)).getString("mime");}catch(Exception e){return null;}}
    @Override public Cursor query(Uri uri,String[] projection,String selection,String[] args,String sort){
        try{
            JSONObject meta=new SecureVault(getContext()).documentMeta(id(uri));
            String[] columns=projection==null?new String[]{OpenableColumns.DISPLAY_NAME,OpenableColumns.SIZE}:projection;
            MatrixCursor result=new MatrixCursor(columns);Object[] values=new Object[columns.length];
            for(int i=0;i<columns.length;i++)values[i]=OpenableColumns.DISPLAY_NAME.equals(columns[i])?meta.getString("name"):OpenableColumns.SIZE.equals(columns[i])?meta.getLong("size"):null;
            result.addRow(values);return result;
        }catch(Exception e){return null;}
    }
    @Override public ParcelFileDescriptor openFile(Uri uri,String mode)throws FileNotFoundException{
        if(!"r".equals(mode))throw new FileNotFoundException("Read-only document");
        try{
            byte[] bytes=new SecureVault(getContext()).documentData(id(uri));
            if(bytes==null)throw new FileNotFoundException("Document removed");
            ParcelFileDescriptor[] pipe=ParcelFileDescriptor.createPipe();
            new Thread(()->{try(OutputStream out=new ParcelFileDescriptor.AutoCloseOutputStream(pipe[1])){out.write(bytes);}catch(Exception ignored){}finally{java.util.Arrays.fill(bytes,(byte)0);}},"avsargo-doc-stream").start();
            return pipe[0];
        }catch(Exception e){throw new FileNotFoundException("Document unavailable");}
    }
    @Override public Uri insert(Uri u,ContentValues v){throw new UnsupportedOperationException("Read-only");}
    @Override public int delete(Uri u,String s,String[] a){throw new UnsupportedOperationException("Read-only");}
    @Override public int update(Uri u,ContentValues v,String s,String[] a){throw new UnsupportedOperationException("Read-only");}
}
