package vn.wordpdf.app;

import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.provider.OpenableColumns;
import android.webkit.MimeTypeMap;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.JSObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ShareInPlugin.class);
        super.onCreate(savedInstanceState);
        handleIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIntent(intent);
    }

    @SuppressWarnings("deprecation")
    private void handleIntent(Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        final List<Uri> uris = new ArrayList<>();
        try {
            if (Intent.ACTION_SEND.equals(action)) {
                Uri u = intent.getParcelableExtra(Intent.EXTRA_STREAM);
                if (u != null) uris.add(u);
            } else if (Intent.ACTION_SEND_MULTIPLE.equals(action)) {
                ArrayList<Uri> list = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
                if (list != null) uris.addAll(list);
            } else if (Intent.ACTION_VIEW.equals(action) && intent.getData() != null) {
                uris.add(intent.getData());
            }
        } catch (Exception ignored) { }
        if (uris.isEmpty()) return;
        intent.setAction("vn.wordpdf.app.HANDLED");

        new Thread(new Runnable() {
            @Override
            public void run() {
                List<JSObject> out = new ArrayList<>();
                File dir = new File(getCacheDir(), "shared");
                dir.mkdirs();
                for (Uri u : uris) {
                    try {
                        String mime = getContentResolver().getType(u);
                        String name = displayName(u);
                        if (name == null || name.trim().isEmpty()) name = "file";
                        name = name.replaceAll("[\\\\/:*?\"<>|]", "_");
                        if (!name.contains(".") && mime != null) {
                            String ext = MimeTypeMap.getSingleton().getExtensionFromMimeType(mime);
                            if (ext != null) name = name + "." + ext;
                        }
                        File f = new File(dir, System.currentTimeMillis() + "_" + name);
                        InputStream in = getContentResolver().openInputStream(u);
                        if (in == null) continue;
                        OutputStream os = new FileOutputStream(f);
                        byte[] buf = new byte[65536];
                        int n;
                        while ((n = in.read(buf)) > 0) os.write(buf, 0, n);
                        os.close();
                        in.close();
                        JSObject o = new JSObject();
                        o.put("path", f.getAbsolutePath());
                        o.put("name", name);
                        o.put("mime", mime == null ? "" : mime);
                        out.add(o);
                    } catch (Exception ignored) { }
                }
                ShareInPlugin.push(out);
            }
        }).start();
    }

    private String displayName(Uri u) {
        Cursor c = null;
        try {
            c = getContentResolver().query(u, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null);
            if (c != null && c.moveToFirst()) return c.getString(0);
        } catch (Exception ignored) {
        } finally {
            if (c != null) c.close();
        }
        return u.getLastPathSegment();
    }
}
