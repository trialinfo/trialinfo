#! /usr/bin/python

import sys
import getopt
import json
from PyQt4.QtCore import QString, QFile, QIODevice
from popplerqt4 import Poppler
import tempfile
import subprocess
import fcntl

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

def fill_one(document, fields, fp):
    set_form_fields(document, fields)
    write_pdf(fp.fileno(), document)

def clear_cloexec(fd):
    flags = fcntl.fcntl(fd, fcntl.F_GETFD)
    fcntl.fcntl(fd, fcntl.F_SETFD, flags & ~fcntl.FD_CLOEXEC)

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

        out = sys.stdout
        if opt_out != None:
            out = open(opt_out, "wb")

        if isinstance(fields, dict):
            fill_one(document, fields, out)
        else:
            array = fields
            if len(array) == 0:
                pass
            elif len(array) == 1:
                fill_one(document, array[0], out)
            else:
                orig_fields = get_form_fields(document)
                fps = []
                for fields in array:
                    fp = tempfile.TemporaryFile()
                    clear_cloexec(fp.fileno())
                    fill_one(document, dict(orig_fields, **fields), fp)
                    fps.append(fp)
                fps.append(out)

                cmd = ['pdfunite']
                cmd.extend(map(lambda fp: '/proc/self/fd/%s' % fp.fileno(), fps))
                subprocess.call(cmd)

    else:
        fields = get_form_fields(document)
        json.dump(fields, sys.stdout, indent=2, ensure_ascii=False)
        sys.stdout.write('\n');

if __name__ == "__main__":
    main()
