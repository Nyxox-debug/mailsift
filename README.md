<p align="center">
    <img src="as/m.png" width="200" />
</p>

This is a Spam/Ham email classifier that uses a model trained on the [SpamAssassin](https://www.kaggle.com/datasets/ganiyuolalekan/spam-assassin-email-classification-dataset) dataset. The model is exported to ONNX format, loaded statically, and used directly in the Svelte frontend.

### Generating the ONNX model files

- First, run `train_classifier.ipynb`
- Then, run `export_onnx.ipynb`

[Pipeline](pipeline.md)

> University Project
