package vn.wordpdf.app;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;
import java.util.List;

@CapacitorPlugin(name = "ShareIn")
public class ShareInPlugin extends Plugin {

    private static final List<JSObject> pending = new ArrayList<>();
    private static ShareInPlugin instance;

    @Override
    public void load() {
        instance = this;
    }

    static void push(List<JSObject> items) {
        if (items == null || items.isEmpty()) return;
        synchronized (pending) {
            pending.addAll(items);
        }
        ShareInPlugin p = instance;
        if (p != null) p.notifyListeners("shared", new JSObject(), true);
    }

    @PluginMethod
    public void take(PluginCall call) {
        JSArray arr = new JSArray();
        synchronized (pending) {
            for (JSObject o : pending) arr.put(o);
            pending.clear();
        }
        JSObject r = new JSObject();
        r.put("files", arr);
        call.resolve(r);
    }
}
