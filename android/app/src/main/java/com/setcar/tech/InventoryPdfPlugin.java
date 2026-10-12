package com.setcar.tech;

import android.app.Activity;
import android.content.Context;
import android.graphics.Color;
import android.os.Handler;
import android.os.Looper;
import android.print.PrintAttributes;
import android.print.PrintJob;
import android.print.PrintManager;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "InventoryPdf")
public class InventoryPdfPlugin extends Plugin {
    @PluginMethod
    public void print(PluginCall call) {
        String html = call.getString("html");
        String requestedJobName = call.getString("jobName", "Tesca Tech - Stock report");
        if (html == null || html.trim().isEmpty()) {
            call.reject("The stock report is empty.");
            return;
        }

        Activity activity = getActivity();
        activity.runOnUiThread(() -> {
            final WebView printWebView = new WebView(activity);
            final ViewGroup content = activity.findViewById(android.R.id.content);
            final Handler handler = new Handler(Looper.getMainLooper());
            final boolean[] started = {false};
            final String jobName = requestedJobName.replaceAll("[\\r\\n]", " ");

            try {
                Object service = activity.getSystemService(Context.PRINT_SERVICE);
                if (!(service instanceof PrintManager)) {
                    call.reject("Android printing is unavailable on this phone.");
                    printWebView.destroy();
                    return;
                }
                PrintManager printManager = (PrintManager) service;
                printWebView.setBackgroundColor(Color.WHITE);
                printWebView.setAlpha(0f);
                printWebView.setClickable(false);
                printWebView.setFocusable(false);
                printWebView.getSettings().setJavaScriptEnabled(false);
                printWebView.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
                content.addView(printWebView, new FrameLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT));

                printWebView.setWebViewClient(new WebViewClient() {
                    @Override
                    public void onPageFinished(WebView view, String url) {
                        if (started[0]) return;
                        started[0] = true;
                        try {
                            PrintAttributes attributes = new PrintAttributes.Builder()
                                    .setMediaSize(new PrintAttributes.MediaSize(
                                            "TESCA_A4_LANDSCAPE", "A4 Landscape", 11690, 8270))
                                    .setColorMode(PrintAttributes.COLOR_MODE_COLOR)
                                    .setMinMargins(PrintAttributes.Margins.NO_MARGINS)
                                    .build();
                            PrintJob job = printManager.print(
                                    jobName,
                                    view.createPrintDocumentAdapter(jobName),
                                    attributes);
                            JSObject result = new JSObject();
                            result.put("jobId", job.getId().toString());
                            call.resolve(result);

                            handler.postDelayed(new Runnable() {
                                @Override
                                public void run() {
                                    if (job.isCompleted() || job.isCancelled() || job.isFailed()) {
                                        content.removeView(printWebView);
                                        printWebView.stopLoading();
                                        printWebView.destroy();
                                    } else {
                                        handler.postDelayed(this, 1000);
                                    }
                                }
                            }, 1000);
                        } catch (Exception error) {
                            content.removeView(printWebView);
                            printWebView.destroy();
                            call.reject("Could not open the Android print dialog.", error);
                        }
                    }
                });
                printWebView.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null);
            } catch (Exception error) {
                if (printWebView.getParent() != null) content.removeView(printWebView);
                printWebView.destroy();
                call.reject("Could not prepare the stock report for printing.", error);
            }
        });
    }
}
