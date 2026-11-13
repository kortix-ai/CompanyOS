#!/usr/bin/env python3
"""Unit tests for _hcl.py, the HCL block reader of the Terraform guard tests."""

import unittest

from _hcl import block, resource_body


SOURCE = """
resource "aws_s3_bucket_versioning" "logs" {
  bucket = "logs-${var.name}"
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket" "logs" {
  bucket = "logs"
}
"""


class BlockTests(unittest.TestCase):
    def test_block_spans_nested_blocks_to_its_own_closing_brace(self):
        self.assertEqual(
            block(SOURCE, 'resource "aws_s3_bucket_versioning" "logs" {'),
            'resource "aws_s3_bucket_versioning" "logs" {\n'
            '  bucket = "logs-${var.name}"\n'
            "  versioning_configuration {\n"
            '    status = "Enabled"\n'
            "  }\n"
            "}",
        )

    def test_block_stops_at_a_nested_dict_closing_brace(self):
        source = 'SPECS = {\n    "a": {\n        "X": 1,\n    },\n    "b": {},\n}\n'
        self.assertEqual(block(source, '"a": {'), '"a": {\n        "X": 1,\n    }')

    def test_block_with_a_missing_header_raises(self):
        with self.assertRaises(ValueError):
            block(SOURCE, 'resource "aws_s3_bucket" "absent" {')

    def test_block_without_a_closing_brace_raises(self):
        with self.assertRaisesRegex(AssertionError, "unterminated"):
            block('resource "x" "y" {\n  a = {\n', 'resource "x" "y" {')


class ResourceBodyTests(unittest.TestCase):
    def test_resource_body_is_the_text_between_the_braces(self):
        self.assertEqual(
            resource_body(SOURCE, "aws_s3_bucket", "logs"), '\n  bucket = "logs"\n'
        )

    def test_resource_body_spans_nested_blocks(self):
        body = resource_body(SOURCE, "aws_s3_bucket_versioning", "logs")
        self.assertTrue(body.endswith('    status = "Enabled"\n  }\n'))

    def test_resource_body_with_a_missing_resource_raises(self):
        with self.assertRaisesRegex(AssertionError, "missing aws_s3_bucket.absent"):
            resource_body(SOURCE, "aws_s3_bucket", "absent")

    def test_resource_body_without_a_closing_brace_raises(self):
        with self.assertRaisesRegex(AssertionError, "unterminated aws_s3_bucket.logs"):
            resource_body('resource "aws_s3_bucket" "logs" {\n  a = 1\n', "aws_s3_bucket", "logs")


if __name__ == "__main__":
    unittest.main()
