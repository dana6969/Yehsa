package com.dana6969.axi0net.ime

import android.app.Activity
import android.view.View
import android.view.ViewGroup
import android.view.ViewTreeObserver
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsAnimationCompat
import androidx.core.view.WindowInsetsCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// The system keyboard's real size, from the window's IME inset. With Android edge-to-edge (Expo SDK
// 53) the window is not resized for the keyboard, and React Native's keyboardDidShow height leaves out
// the navigation bar, so a lift computed from it falls short. This reads the IME inset itself: the
// keyboard's toolbar, suggestion strip and number row are all inside it, and a floating keyboard reads
// as 0. A 0x0 probe view in the content frame gets every insets change (and the end of each keyboard
// animation) without replacing anyone else's listener; a global-layout listener is the backup.
class ImeModule : Module() {
  private var probe: View? = null
  private var layoutListener: ViewTreeObserver.OnGlobalLayoutListener? = null
  private var observedDecor: View? = null
  @Volatile private var lastKey: String = ""

  private fun activity(): Activity? = appContext.currentActivity

  private fun snapshot(view: View?, given: WindowInsetsCompat? = null): Map<String, Any> {
    val decor = view ?: return mapOf("ok" to false)
    val density = decor.resources.displayMetrics.density.toDouble().coerceAtLeast(0.1)
    val insets = given ?: ViewCompat.getRootWindowInsets(decor) ?: return mapOf("ok" to false)
    val ime = insets.getInsets(WindowInsetsCompat.Type.ime()).bottom
    val nav = insets.getInsets(WindowInsetsCompat.Type.navigationBars()).bottom
    val visible = insets.isVisible(WindowInsetsCompat.Type.ime())
    val root = decor.rootView ?: decor
    return mapOf(
      "ok" to true,
      "visible" to (visible && ime > 0),
      "imeBottom" to ime / density,
      "navBottom" to nav / density,
      "windowHeight" to root.height / density
    )
  }

  private fun emitIfChanged(view: View?, given: WindowInsetsCompat? = null) {
    val snap = snapshot(view, given)
    if (snap["ok"] != true) return
    val key = "${snap["visible"]}:${Math.round((snap["imeBottom"] as Double) * 2)}:${Math.round((snap["windowHeight"] as Double) * 2)}"
    if (key == lastKey) return
    lastKey = key
    try {
      sendEvent("onIme", snap)
    } catch (e: Exception) {
      // No listener yet.
    }
  }

  private fun attach() {
    val act = activity() ?: return
    act.runOnUiThread {
      if (probe != null) return@runOnUiThread
      val decor = act.window?.decorView ?: return@runOnUiThread
      val content = act.findViewById<ViewGroup>(android.R.id.content)
      if (content != null) {
        val v = View(act)
        v.layoutParams = ViewGroup.LayoutParams(0, 0)
        v.importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
        ViewCompat.setOnApplyWindowInsetsListener(v) { _, insets ->
          emitIfChanged(decor, insets)
          insets
        }
        ViewCompat.setWindowInsetsAnimationCallback(
          v,
          object : WindowInsetsAnimationCompat.Callback(WindowInsetsAnimationCompat.Callback.DISPATCH_MODE_CONTINUE_ON_SUBTREE) {
            override fun onProgress(
              insets: WindowInsetsCompat,
              running: MutableList<WindowInsetsAnimationCompat>
            ): WindowInsetsCompat = insets

            override fun onEnd(animation: WindowInsetsAnimationCompat) {
              emitIfChanged(decor)
            }
          }
        )
        content.addView(v)
        probe = v
        ViewCompat.requestApplyInsets(v)
      }
      val listener = ViewTreeObserver.OnGlobalLayoutListener { emitIfChanged(decor) }
      decor.viewTreeObserver.addOnGlobalLayoutListener(listener)
      layoutListener = listener
      observedDecor = decor
    }
  }

  private fun detach() {
    val act = activity()
    val work = Runnable {
      val v = probe
      if (v != null) {
        ViewCompat.setOnApplyWindowInsetsListener(v, null)
        ViewCompat.setWindowInsetsAnimationCallback(v, null)
        (v.parent as? ViewGroup)?.removeView(v)
      }
      probe = null
      val l = layoutListener
      val d = observedDecor
      if (l != null && d != null) {
        try {
          d.viewTreeObserver.removeOnGlobalLayoutListener(l)
        } catch (e: Exception) {
          // The window is already gone.
        }
      }
      layoutListener = null
      observedDecor = null
      lastKey = ""
    }
    if (act != null) act.runOnUiThread(work) else work.run()
  }

  override fun definition() = ModuleDefinition {
    Name("YehsaIme")
    Events("onIme")

    // The keyboard right now: { ok, visible, imeBottom, navBottom, windowHeight } in dp.
    Function("current") {
      snapshot(activity()?.window?.decorView)
    }

    OnStartObserving {
      attach()
    }

    OnStopObserving {
      detach()
    }

    OnActivityEntersForeground {
      lastKey = ""
    }

    OnDestroy {
      detach()
    }
  }
}
