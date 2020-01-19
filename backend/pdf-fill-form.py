#! /usr/bin/python3

import sys
import getopt
import json
from PyQt5.QtCore import QFile, QIODevice
from popplerqt5 import Poppler
import tempfile
import subprocess
import os
import re

def usage(err):
    print("USAGE: " + sys.argv[0] + " [--fill] [--out=out.pdf] {in.pdf} ...")
    sys.exit(err)

def get_form_fields(document):
    fields = {}
    for n in range(0, document.numPages()):
        page = document.page(n)
        for field in page.formFields():
            name = field.name()
            if field.type() == Poppler.FormField.FormText:
                fields[name] = field.text()
            elif field.type() == Poppler.FormField.FormButton:
                if field.buttonType() == Poppler.FormFieldButton.CheckBox:
                    fields[name] = field.state()
                elif field.buttonType() == Poppler.FormFieldButton.Radio:
                    # Poppler currently doesn't have a way to determine the
                    # field name of a radio button or the name of a group of
                    # radio buttons.
                    pass
    return fields

def set_form_fields(document, fields):
    for n in range(0, document.numPages()):
        page = document.page(n)
        for field in page.formFields():
            name = field.name()
            if name in fields:
                value = fields[name]
                if field.type() == Poppler.FormField.FormText:
                    if value == None:
                        value = ''
                    elif not isinstance(value, str):
                        value = str(value)
                    field.setText(value)
                elif field.type() == Poppler.FormField.FormButton:
                    if field.buttonType() == Poppler.FormFieldButton.CheckBox:
                        field.setState(value)
                    elif field.buttonType() == Poppler.FormFieldButton.Radio:
                        pass

def write_pdf(fd, document):
    converter = document.pdfConverter()
    converter.setPDFOptions(converter.pdfOptions() | Poppler.PDFConverter.WithChanges)
    qfile = QFile()
    qfile.open(fd, QIODevice.WriteOnly)
    converter.setOutputDevice(qfile)
    if not converter.convert():
        raise IOError(converter.lastError())

def forms_per_page(document):
    for n in range(0, document.numPages()):
        max_forms = 1
        page = document.page(n)
        for field in page.formFields():
            name = field.name()
        match = re.search('%(\d+)$', name)
        if match:
            max_forms = max(max_forms, int(match[1]))
    return max_forms

def collapse_array(array, num):
    if num == 1:
        return array
    coll_array = []
    for index, fields in enumerate(array):
        coll_fields = {}
        for name, value in fields.items():
            coll_fields[name + '%' + str(index % num + 1)] = value
        if index % num == 0:
            coll_array.append({})
        coll_array[index // num].update(coll_fields)
    return coll_array

def fill_one(document, fields, fp):
    set_form_fields(document, fields)
    write_pdf(fp.fileno(), document)

def main():
    try:
        opts, args = getopt.gnu_getopt(sys.argv[1:], "o:", ["fill", "out="])
    except getopt.GetoptError as err:
        print(str(err))
        sys.exit(2)

    opt_fill = False
    opt_out = None
    for opt, arg in opts:
        if opt == '--fill':
            opt_fill = True
        if opt in ('-o', '--out'):
            opt_out = arg
    if len(args) == 0:
        usage(2)

    filenames = {}
    documents = {}
    for arg in args:
        document = Poppler.Document.load(arg)
        if document == None:
            sys.exit(2)

        num = forms_per_page(document)
        if num in documents:
            print('Forms %s and %s have the same number of forms' %
                  (filenames[num], arg), file=sys.stderr)
            sys.exit(1)
        filenames[num] = arg
        documents[num] = document
    num_forms = list(documents)
    num_forms.sort()

    def num_for_len(len):
        found_num = None
        for num in num_forms:
            if found_num != None and num > len:
                break
            found_num = num
        return found_num

    if opt_fill:
        fields = json.load(sys.stdin)
        if opt_out == None:
            out = os.fdopen(sys.stdout.fileno(), "wb")
        else:
            out = open(opt_out, "wb")

        if isinstance(fields, dict):
            array = [fields]
        else:
            array = fields

        num = len(array)
        if num == 0:
            pass
        elif num in documents:
            for collapsed in collapse_array(array, num):
                fill_one(documents[num], collapsed, out)
        else:
            split_array = {}
            while len(array):
                num = num_for_len(len(array))
                if not(num in split_array):
                    split_array[num] = []
                if num > len(array):
                    split_array[num].extend(array)
                    array = []
                else:
                    n = len(array) - len(array) % num
                    split_array[num].extend(array[0:n])
                    array = array[n:]

            files = []
            orig_fields = get_form_fields(document)
            for num in reversed(num_forms):
                if num in split_array:
                    for collapsed in collapse_array(split_array[num], num):
                        tmp = tempfile.NamedTemporaryFile()
                        fill_one(documents[num], dict(orig_fields, **collapsed), tmp)
                        files.append(tmp)

            # Note: pdfunite wants a seekable output file, so we cannot
            # pass it sys.stdout which may be a pipe.

            tmp_out = tempfile.NamedTemporaryFile()
            files.append(tmp_out);

            cmd = ['pdfunite']
            cmd.extend(map(lambda file: file.name, files))
            subprocess.call(cmd)

            while True:
                chunk = tmp_out.read(16384)
                if not chunk:
                    break
                out.write(chunk)

    else:
        fields = get_form_fields(document)
        json.dump(fields, sys.stdout, indent=2, ensure_ascii=False)
        sys.stdout.write('\n');

if __name__ == "__main__":
    main()
