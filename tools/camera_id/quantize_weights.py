# Weight-only int8 quantisation of the DINOv2-small ONNX export (MatMul weights, per output channel).
#   python quantize_weights.py dino_s_fp32.onnx dinov2_small_int8.onnx
# Weights are stored as int8 with a DequantizeLinear in front of each MatMul. Activations stay float,
# so every runtime (x86, ARM, onnxruntime-node, onnxruntime-react-native) computes in float32 and
# gives the same embedding. Dynamic int8 (activation quantisation) gave embeddings that differed
# between runtimes (cosine 0.93 to the float model on onnxruntime 1.24 x86, 0.99 on 1.32), so it was dropped.
import sys
import numpy as np
import onnx
from onnx import numpy_helper, helper, TensorProto
m = onnx.load(sys.argv[1])
inits = {i.name: i for i in m.graph.initializer}
new_nodes, drop, count = [], set(), 0
for n in m.graph.node:
    if n.op_type == "MatMul" and n.input[1] in inits and len(inits[n.input[1]].dims) == 2:
        w = numpy_helper.to_array(inits[n.input[1]]).astype(np.float32)
        scale = np.maximum(np.abs(w).max(0), 1e-8) / 127.0
        q = np.clip(np.round(w / scale), -127, 127).astype(np.int8)
        base = n.input[1]
        m.graph.initializer.append(numpy_helper.from_array(q, base + "_q"))
        m.graph.initializer.append(numpy_helper.from_array(scale.astype(np.float32), base + "_s"))
        new_nodes.append(helper.make_node("DequantizeLinear", [base + "_q", base + "_s"], [base + "_dq"], axis=1, name=base + "_dql"))
        n.input[1] = base + "_dq"; drop.add(base); count += 1
keep = [i for i in m.graph.initializer if i.name not in drop or any(i.name in nn.input for nn in m.graph.node)]
del m.graph.initializer[:]; m.graph.initializer.extend(keep)
nodes = list(m.graph.node); del m.graph.node[:]; m.graph.node.extend(new_nodes + nodes)
if m.opset_import[0].version < 13:
    m.opset_import[0].version = 13
onnx.checker.check_model(m)
onnx.save(m, sys.argv[2]); print("quantised", count, "matmuls")
