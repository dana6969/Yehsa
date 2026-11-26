package com.dana6969.axi0net.llmasset

import android.app.ActivityManager
import android.content.Context
import android.os.StatFs
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileOutputStream

// Yehsa AI (on-device): the GGUF model ships inside the APK as an uncompressed asset. llama.cpp
// needs a real file path, so the first time the AI is used it is copied once to app storage
// (streamed, 1 MB at a time, with progress), then reused. Also reports RAM for the low-RAM skip.
class LlmAssetModule : Module() {
  @Volatile private var cancelled = false

  private fun context(): Context? = appContext.reactContext?.applicationContext

  override fun definition() = ModuleDefinition {
    Name("YehsaLlmAsset")
    Events(EVENT)

    Function("memory") {
      val am = context()?.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager
      val info = ActivityManager.MemoryInfo()
      am?.getMemoryInfo(info)
      mapOf(
        "total" to info.totalMem.toDouble(),
        "avail" to info.availMem.toDouble(),
        "lowMemory" to info.lowMemory,
        "lowRamDevice" to (am?.isLowRamDevice ?: false),
        "cores" to Runtime.getRuntime().availableProcessors()
      )
    }

    // Size of a bundled asset in bytes, or -1 when it is not in this APK.
    Function("assetSize") { path: String ->
      val ctx = context() ?: return@Function -1.0
      try {
        ctx.assets.openFd(path).use { it.length.toDouble() }
      } catch (e: Exception) {
        try {
          ctx.assets.open(path).use { stream ->
            var total = 0L
            val buf = ByteArray(1 shl 20)
            while (true) { val n = stream.read(buf); if (n < 0) break; total += n }
            total.toDouble()
          }
        } catch (e2: Exception) { -1.0 }
      }
    }

    Function("freeBytes") { dir: String ->
      try { StatFs(dir.removePrefix("file://")).availableBytes.toDouble() } catch (e: Exception) { -1.0 }
    }

    Function("filesDir") { context()?.filesDir?.absolutePath ?: "" }

    Function("cancel") { cancelled = true }

    // Copies an asset to dest (a plain path) through a .part file, then renames it.
    AsyncFunction("copyAsset") { path: String, dest: String ->
      val ctx = context() ?: throw IllegalStateException("No app context")
      cancelled = false
      val target = File(dest.removePrefix("file://"))
      target.parentFile?.mkdirs()
      val part = File(target.absolutePath + ".part")
      var copied = 0L
      var lastSent = 0L
      ctx.assets.open(path).use { input ->
        FileOutputStream(part).use { out ->
          val buf = ByteArray(1 shl 20)
          while (true) {
            if (cancelled) { part.delete(); throw IllegalStateException("cancelled") }
            val n = input.read(buf)
            if (n < 0) break
            out.write(buf, 0, n)
            copied += n
            if (copied - lastSent >= (16L shl 20)) {
              lastSent = copied
              sendEvent(EVENT, mapOf("copied" to copied.toDouble()))
            }
          }
          out.fd.sync()
        }
      }
      if (target.exists()) target.delete()
      if (!part.renameTo(target)) throw IllegalStateException("Could not finish the copy")
      sendEvent(EVENT, mapOf("copied" to copied.toDouble(), "done" to true))
      copied.toDouble()
    }
  }

  companion object {
    const val EVENT = "onLlmCopy"
  }
}
