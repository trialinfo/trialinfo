#! /usr/bin/python

import sys
import getopt
import json
from PyQt4.QtCore import QString, QFile, QIODevice
from popplerqt4 import Poppler

def usage(err):
    print "USAGE: " + sys.argv[0] + " [--fill] [--out=out.pdf] {in.pdf}"
    sys.exit(err)

def get_form_fields(document):
    fields = {}
    for n in range(0, document.numPages()):
        page = document.page(n)
        for field in page.formFields():
            name = str(field.name())
            if field.type() == Poppler.FormField.FormText:
                fields[name] = str(field.text().toUtf8())
            elif field.type() == Poppler.FormField.FormButton:
                fields[name] = field.state()
    return fields

def set_form_fields(document, fields):
    for n in range(0, document.numPages()):
        page = document.page(n)
        for field in page.formFields():
            name = str(field.name())
            if name in fields:
                value = fields[name]
                if field.type() == Poppler.FormField.FormText:
                    if value == None:
                        value = ''
                    elif not isinstance(value, basestring):
                        value = str(value)
                    field.setText(QString.fromUtf8(value))
                elif field.type() == Poppler.FormField.FormButton:
                    field.setState(value)

def write_pdf(fd, document):
    converter = document.pdfConverter()
    converter.setPDFOptions(converter.pdfOptions() | Poppler.PDFConverter.WithChanges)
    qfile = QFile()
    qfile.open(fd, QIODevice.WriteOnly)
    converter.setOutputDevice(qfile)
    if not converter.convert():
        raise IOError(converter.lastError())

def main():
    try:
        opts, args = getopt.gnu_getopt(sys.argv[1:], "o:", ["fill", "out="])
    except getopt.GetoptError as err:
        print str(err)
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

    document = Poppler.Document.load(args[0])
    if document == None:
        sys.exit(2)

    if opt_fill:
        fields = json.load(sys.stdin)
        set_form_fields(document, fields)

        out = sys.stdout
        if opt_out != None:
            out = open(opt_out, "wb")
        write_pdf(out.fileno(), document)
        out.flush()

    else:
        fields = get_form_fields(document)
        json.dump(fields, sys.stdout, indent=2, ensure_ascii=False)
        sys.stdout.write('\n');

if __name__ == "__main__":
    main()
