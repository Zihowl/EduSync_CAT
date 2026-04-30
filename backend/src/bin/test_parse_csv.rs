use csv::ReaderBuilder;
use encoding_rs::WINDOWS_1252;
use std::fs::read;
use std::io::Cursor;

fn main() {
    let path = "../test-data/horarios_prueba_errores.csv";
    let data = match read(path) {
        Ok(d) => d,
        Err(e) => {
            eprintln!("No se pudo leer el archivo {}: {}", path, e);
            std::process::exit(1);
        }
    };

    let csv_string = match std::str::from_utf8(&data) {
        Ok(s) => s.to_string(),
        Err(_) => {
            let (decoded, _, had_errors) = WINDOWS_1252.decode(&data);
            if had_errors {
                eprintln!("Advertencia: se detectaron caracteres inválidos durante la decodificación WINDOWS-1252.");
            }
            decoded.into_owned()
        }
    };

    let mut reader = ReaderBuilder::new().flexible(true).from_reader(Cursor::new(csv_string.as_bytes()));

    match reader.headers() {
        Ok(headers) => {
            println!("Encabezados: {:?}", headers);
        }
        Err(e) => {
            eprintln!("No se pudo leer encabezados CSV: {}", e);
            std::process::exit(1);
        }
    }

    let mut rows = 0usize;
    for result in reader.records() {
        match result {
            Ok(record) => {
                rows += 1;
            }
            Err(e) => {
                eprintln!("No se pudo leer una fila CSV: {}", e);
                std::process::exit(1);
            }
        }
    }

    println!("Filas leídas: {}", rows);
}
