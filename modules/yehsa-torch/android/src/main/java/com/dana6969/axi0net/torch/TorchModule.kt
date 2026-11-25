package com.dana6969.axi0net.torch

import android.content.Context
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import android.os.SystemClock
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// The phone's flashlight through CameraManager.setTorchMode: no camera preview and no camera
// permission. A pattern plays on its own thread against the system clock, so Morse timing does not
// drift with the JavaScript thread, and the light is always switched off when it stops.
class TorchModule : Module() {
  @Volatile private var worker: Thread? = null
  @Volatile private var generation = 0
  @Volatile private var keepInBackground = false

  private fun manager(): CameraManager? =
    appContext.reactContext?.getSystemService(Context.CAMERA_SERVICE) as? CameraManager

  private fun torchId(): String? {
    val m = manager() ?: return null
    return try {
      val ids = m.cameraIdList.filter {
        m.getCameraCharacteristics(it).get(CameraCharacteristics.FLASH_INFO_AVAILABLE) == true
      }
      ids.firstOrNull {
        m.getCameraCharacteristics(it).get(CameraCharacteristics.LENS_FACING) == CameraCharacteristics.LENS_FACING_BACK
      } ?: ids.firstOrNull()
    } catch (e: Exception) {
      null
    }
  }

  private fun setTorch(on: Boolean): Boolean {
    val id = torchId() ?: return false
    return try {
      manager()?.setTorchMode(id, on)
      true
    } catch (e: Exception) {
      false
    }
  }

  private fun stopAll(reason: String) {
    generation += 1
    worker?.interrupt()
    worker = null
    setTorch(false)
    sendEvent(EVENT, mapOf("playing" to false, "reason" to reason))
  }

  override fun definition() = ModuleDefinition {
    Name("YehsaTorch")
    Events(EVENT)

    Function("available") { torchId() != null }

    Function("set") { on: Boolean ->
      generation += 1
      worker?.interrupt()
      worker = null
      setTorch(on)
    }

    Function("setKeepInBackground") { keep: Boolean ->
      keepInBackground = keep
      true
    }

    // steps: milliseconds, alternating on and off, starting with on. loop: start again after the last step.
    Function("play") { steps: List<Int>, loop: Boolean ->
      if (torchId() == null || steps.isEmpty()) return@Function false
      generation += 1
      val mine = generation
      worker?.interrupt()
      val thread = Thread {
        var at = SystemClock.uptimeMillis()
        try {
          do {
            for ((i, ms) in steps.withIndex()) {
              if (mine != generation) return@Thread
              setTorch(i % 2 == 0)
              at += ms.toLong()
              val wait = at - SystemClock.uptimeMillis()
              if (wait > 0) Thread.sleep(wait)
            }
          } while (loop && mine == generation)
        } catch (e: InterruptedException) {
          // stopped
        } finally {
          if (mine == generation) {
            setTorch(false)
            worker = null
            sendEvent(EVENT, mapOf("playing" to false, "reason" to "done"))
          }
        }
      }
      thread.name = "YehsaTorchPattern"
      worker = thread
      thread.start()
      true
    }

    Function("stop") {
      stopAll("stopped")
      true
    }

    OnActivityEntersBackground {
      if (!keepInBackground) stopAll("background")
    }

    OnDestroy {
      generation += 1
      worker?.interrupt()
      setTorch(false)
    }
  }

  companion object {
    const val EVENT = "onTorchState"
  }
}
